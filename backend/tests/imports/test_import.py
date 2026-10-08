import base64
import json
from io import BytesIO

import pytest
from django.core.exceptions import PermissionDenied
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from PIL import Image

from access.policy import Access
from imports import services
from imports.schemas import ChoicesIn
from people.models import ContactMethod, Note, Person
from tests.factories import ContactMethodFactory, NoteFactory


def jpeg() -> str:
    buffer = BytesIO()
    Image.new("RGB", (60, 75), (90, 140, 90)).save(buffer, "JPEG")
    return base64.b64encode(buffer.getvalue()).decode()


def vcard(name: str, *lines: str) -> str:
    body = "\n".join(lines)
    return f"BEGIN:VCARD\nVERSION:3.0\nFN:{name}\n{body}\nEND:VCARD\n"


def vcf(*cards: str) -> SimpleUploadedFile:
    return SimpleUploadedFile("contacts.vcf", "".join(cards).encode(), content_type="text/vcard")


GRETA = vcard(
    "Greta Holm",
    "TEL;TYPE=cell:+46 73 111 22 33",
    "EMAIL:greta@example.com",
    "BDAY:1990-06-14",
    "TITLE:Designer",
    "ORG:Acme;",
    "NOTE:Met at the 2024 offsite",
)
LARS = vcard("Lars Eriksen", "TEL:+46 70 222 33 44")
CHEN = vcard("Chen Wei", "EMAIL:chen.wei@example.com")
INES = vcard(
    "Ines Berg",
    "TEL:070 555 12 90",
    "EMAIL:ines@example.com",
    "TITLE:Doctor",
    "BDAY:--0302",
    "NOTE:From the climbing gym",
)


def run(api, user, upload, picked, space=None):
    choices = {"picked": picked, "space": str(space) if space else None}
    return api.login(user).upload("/imports", {"file": upload, "choices": json.dumps(choices)})


def new(*indexes):
    return [{"index": index, "action": "new"} for index in indexes]


def merge(index, person):
    return [{"index": index, "action": "merge", "into": str(person.pk)}]


def test_imports_the_picked_contacts_as_new_people(api, world):
    response = run(api, world.ela, vcf(GRETA, LARS, CHEN), new(0, 2))

    assert response.status_code == 200
    body = response.json()
    assert (body["added"], body["merged"], body["left_out"], body["space"]) == (2, 0, 1, None)
    greta = Person.objects.get(owner=world.ela, name="Greta Holm")
    assert str(greta.added_by_import_id) == body["import_id"]
    assert greta.added_by_import.file_name == "contacts.vcf"
    assert (greta.birth_day, greta.birth_month, greta.birth_year) == (14, 6, 1990)
    assert greta.work == "Designer, Acme"
    assert [(m.kind, m.label, m.value) for m in greta.contact_methods.all()] == [
        ("phone", "mobile", "+46 73 111 22 33"),
        ("email", "", "greta@example.com"),
    ]
    assert Note.objects.get(author=world.ela, person=greta).body == "Met at the 2024 offsite"
    assert Person.objects.filter(owner=world.ela, name="Chen Wei").exists()
    assert not Person.objects.filter(name="Lars Eriksen").exists()


def test_photos_come_through_the_photo_pipeline(api, world):
    run(api, world.ela, vcf(vcard("Greta Holm", f"PHOTO;ENCODING=b;TYPE=JPEG:{jpeg()}")), new(0))

    greta = Person.objects.get(name="Greta Holm")
    assert greta.photo.name.endswith(".webp")
    assert greta.photo_thumbnail.name.endswith("-thumbnail.webp")


def test_merge_adds_only_whats_missing(api, world):
    world.ines.work = "Nurse"
    world.ines.save()
    NoteFactory(author=world.ela, person=world.ines, body="Climbs on Tuesdays")

    response = run(api, world.ela, vcf(INES), merge(0, world.ines))

    assert response.json()["merged"] == 1
    world.ines.refresh_from_db()
    assert world.ines.name == "Ines"
    assert world.ines.work == "Nurse"
    assert (world.ines.birth_day, world.ines.birth_month, world.ines.birth_year) == (2, 3, None)
    assert [m.value for m in world.ines.contact_methods.all()] == [
        "+46 70 555 12 90",
        "ines@example.com",
    ]
    assert world.ines.added_by_import is None
    note = Note.objects.get(author=world.ela, person=world.ines)
    assert note.body == "Climbs on Tuesdays\n\nFrom the climbing gym"


def test_two_contacts_merge_into_one_person(api, world):
    twice = vcf(INES, vcard("Ines B.", "TEL:+46 70 555 12 90", "EMAIL:ines@example.com"))

    run(api, world.ela, twice, merge(0, world.ines) + merge(1, world.ines))

    emails = world.ines.contact_methods.filter(kind=ContactMethod.ContactKind.EMAIL)
    assert [m.value for m in emails] == ["ines@example.com"]


def test_space_for_new_people_only(api, world):
    response = run(
        api, world.ela, vcf(GRETA, INES), new(0) + merge(1, world.ines), space=world.climbing.pk
    )

    assert response.json()["space"]["name"] == "Climbing club"
    greta = Person.objects.get(name="Greta Holm")
    assert list(greta.spaces.all()) == [world.climbing]
    assert list(world.ines.spaces.all()) == [world.climbing]  # was there already


def test_left_out_counts_skips_too(api, world):
    picked = [*new(0), {"index": 1, "action": "skip"}]

    response = run(api, world.ela, vcf(GRETA, LARS, CHEN), picked)

    assert (response.json()["added"], response.json()["left_out"]) == (1, 2)


@pytest.mark.parametrize(
    "picked",
    [
        [{"index": 5, "action": "new"}],
        [{"index": 0, "action": "new"}, {"index": 0, "action": "new"}],
        [{"index": 0, "action": "merge"}],
        "into emma, who isn't Ines's match",
        "into tom, who is shared",
    ],
)
def test_bad_choices(api, world, picked):
    if picked == "into emma, who isn't Ines's match":
        picked = merge(0, world.emma)
    elif picked == "into tom, who is shared":
        picked = merge(0, world.tom)
    upload = vcf(vcard("Tom", "EMAIL:tom@example.com")) if "tom" in str(picked) else vcf(INES)
    people = Person.objects.count()

    response = run(api, world.ela, upload, picked)

    assert response.status_code == 422
    assert Person.objects.count() == people


def test_choices_that_arent_json(api, world):
    response = api.login(world.ela).upload("/imports", {"file": vcf(GRETA), "choices": "{oops"})

    assert response.status_code == 422


def test_space_you_cant_add_to_is_403(api, world):
    response = run(api, world.ela, vcf(GRETA), new(0), space=world.hackathon.pk)  # viewer

    assert response.status_code == 403
    assert not Person.objects.filter(name="Greta Holm").exists()


def test_space_you_cant_see_is_404(api, world):
    other = world.climbing
    response = run(api, world.sofia, vcf(GRETA), new(0), space=other.pk)

    assert response.status_code == 404


def test_merge_target_gone(api, world):
    world.emma.deleted_at = timezone.now()  # torn out after the preview
    world.emma.save()

    response = run(api, world.ela, vcf(vcard("Emma")), merge(0, world.emma))

    assert response.status_code == 422
    assert response.json()["detail"][0]["msg"] == (
        "Emma isn't in your book any more; go back and choose again."
    )


def stored_files(settings) -> list[str]:
    photos = settings.MEDIA_ROOT / "photos"
    return sorted(p.name for p in photos.rglob("*") if p.is_file()) if photos.exists() else []


def test_one_transaction_and_no_files_left_behind(api, world, settings):
    broken = base64.b64encode(b"not a photo").decode()
    upload = vcf(
        vcard("Greta Holm", f"PHOTO;ENCODING=b;TYPE=JPEG:{jpeg()}"),
        vcard("Lars Eriksen", f"PHOTO;ENCODING=b;TYPE=JPEG:{broken}"),
    )
    people = Person.objects.count()

    response = run(api, world.ela, upload, new(0, 1))

    assert response.status_code == 422
    assert response.json()["detail"][0]["msg"] == "Lars Eriksen's photo can't be read."
    assert Person.objects.count() == people
    assert stored_files(settings) == []


def test_needs_full_access(world):
    access = Access.limited(world.ela, include_private=True, read_only=True)

    with pytest.raises(PermissionDenied):
        services.run_import(access, vcf(GRETA), ChoicesIn(picked=new(0)))


def test_needs_a_login(api):
    assert api.upload("/imports", {"file": vcf(GRETA), "choices": "{}"}).status_code == 401


def test_contact_details_are_compared_like_matching(api, world):
    ContactMethodFactory(person=world.emma, kind="email", value="Emma@Example.com")

    run(api, world.ela, vcf(vcard("Emma", "EMAIL:emma@example.com")), merge(0, world.emma))

    assert world.emma.contact_methods.count() == 1
