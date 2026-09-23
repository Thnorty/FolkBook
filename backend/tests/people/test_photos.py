from io import BytesIO

import pytest
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image

from people import photos
from people.models import Person
from tests.factories import PersonFactory

pytestmark = pytest.mark.django_db


def photo_file(size=(1200, 900), fmt="JPEG", mode="RGB", **save_options) -> SimpleUploadedFile:
    buffer = BytesIO()
    Image.new(mode, size, (200, 80, 60)).save(buffer, fmt, **save_options)
    return SimpleUploadedFile(f"photo.{fmt.lower()}", buffer.getvalue())


def with_location() -> SimpleUploadedFile:
    exif = Image.Exif()
    exif[0x010F] = "PhoneMaker"  # camera make
    exif.get_ifd(0x8825)[2] = (41.0, 2.0, 30.0)  # GPS latitude: Istanbul
    return photo_file(exif=exif)


def upload(client, user, person, file):
    client.force_login(user)
    return client.post(f"/api/people/{person.pk}/photo", {"file": file})


def stored(name: str) -> Image.Image:
    with default_storage.open(name) as f:
        image = Image.open(f)
        image.load()
    return image


class TestProcessing:
    def test_every_photo_becomes_a_4_to_5_webp_and_thumbnail(self):
        full, thumbnail = photos.prepare(photo_file(size=(3000, 1000)))

        assert Image.open(full).size == photos.FULL_SIZE
        assert Image.open(full).format == "WEBP"
        assert Image.open(thumbnail).size == photos.THUMBNAIL_SIZE

    def test_drops_exif_like_where_it_was_taken(self):
        full, _ = photos.prepare(with_location())

        assert dict(Image.open(full).getexif()) == {}

    def test_transparent_parts_become_paper(self):
        full, _ = photos.prepare(photo_file(fmt="PNG", mode="RGBA", size=(400, 500)))

        assert Image.open(full).mode == "RGB"

    def test_rejects_files_that_arent_photos(self, client, world):
        response = upload(
            client, world.ela, world.emma, SimpleUploadedFile("a.jpg", b"not a photo")
        )

        assert response.status_code == 422
        assert "photo we can read" in response.json()["detail"][0]["msg"]

    def test_rejects_huge_files(self, client, world, monkeypatch):
        monkeypatch.setattr(photos, "MAX_BYTES", 100)

        assert upload(client, world.ela, world.emma, photo_file()).status_code == 422


class TestUploadAndServe:
    def test_upload_then_anyone_who_can_see_them_gets_it(self, client, world):
        response = upload(client, world.ela, world.oskar, with_location())

        assert response.status_code == 200
        photo = response.json()["photo"]
        for user in (world.ela, world.deniz, world.kaan):  # Oskar is in Climbing club
            client.force_login(user)
            full = client.get(photo["url"])
            assert full.status_code == 200
            assert full["Content-Type"] == "image/webp"
            assert "private" in full["Cache-Control"]
            assert client.get(photo["thumbnail_url"]).status_code == 200

    def test_people_who_cant_see_them_get_nothing(self, client, world):
        url = upload(client, world.ela, world.emma, photo_file()).json()["photo"]["url"]

        client.force_login(world.deniz)  # Emma is in no space
        assert client.get(url).status_code == 404

    def test_a_new_photo_gets_a_new_address_and_the_old_files_go(
        self, client, world, django_capture_on_commit_callbacks
    ):
        with django_capture_on_commit_callbacks(execute=True):
            upload(client, world.ela, world.emma, photo_file())
        old = Person.objects.get(pk=world.emma.pk)
        old_url = client.get(f"/api/people/{world.emma.pk}").json()["photo"]["url"]

        with django_capture_on_commit_callbacks(execute=True):
            new_url = upload(client, world.ela, world.emma, photo_file()).json()["photo"]["url"]

        assert new_url != old_url
        assert not default_storage.exists(old.photo.name)
        assert not default_storage.exists(old.photo_thumbnail.name)
        assert stored(Person.objects.get(pk=world.emma.pk).photo.name).size == photos.FULL_SIZE

    def test_remove_photo(self, client, world, django_capture_on_commit_callbacks):
        with django_capture_on_commit_callbacks(execute=True):
            upload(client, world.ela, world.emma, photo_file())
        name = Person.objects.get(pk=world.emma.pk).photo.name

        with django_capture_on_commit_callbacks(execute=True):
            response = client.delete(f"/api/people/{world.emma.pk}/photo")

        assert response.json()["photo"] is None
        assert not default_storage.exists(name)

    def test_deleting_the_person_deletes_their_photo(
        self, client, world, django_capture_on_commit_callbacks
    ):
        person = PersonFactory(owner=world.ela, name="Temp")
        with django_capture_on_commit_callbacks(execute=True):
            upload(client, world.ela, person, photo_file())
        name = Person.objects.get(pk=person.pk).photo.name

        with django_capture_on_commit_callbacks(execute=True):
            client.delete(f"/api/people/{person.pk}")

        assert not default_storage.exists(name)


class TestWhoMayChangeThePhoto:
    def test_space_editors_may(self, client, world):
        assert upload(client, world.deniz, world.oskar, photo_file()).status_code == 200

    def test_space_viewers_may_not(self, client, world):
        assert upload(client, world.kaan, world.oskar, photo_file()).status_code == 403

    def test_people_who_cant_see_them_get_404(self, client, world):
        assert upload(client, world.sofia, world.emma, photo_file()).status_code == 404

    def test_nobody_changes_someone_elses_me(self, client, world):
        # Ela can see Defne's Me through Hackathon 2026, but it's Defne's own profile.
        assert upload(client, world.ela, world.defne.me, photo_file()).status_code == 403


class TestCaptionAndSpaces:
    def test_the_caption_is_saved_with_the_person(self, api, world):
        api.login(world.ela).patch(f"/people/{world.emma.pk}", {"photo_caption": "Emma, 2024"})
        world.emma.refresh_from_db()

        assert world.emma.photo_caption == "Emma, 2024"

    def test_editing_spaces_changes_only_the_ones_you_can_see(self, api, world):
        # Oskar is in Climbing club; Ela also sees Hackathon 2026 but only as a viewer.
        response = api.login(world.ela).patch(f"/people/{world.oskar.pk}", {"space_ids": []})

        assert response.status_code == 200
        assert list(world.oskar.spaces.all()) == []

        response = api.patch(f"/people/{world.oskar.pk}", {"space_ids": [str(world.hackathon.pk)]})
        assert response.status_code == 403  # a viewer can't add people to Hackathon 2026
