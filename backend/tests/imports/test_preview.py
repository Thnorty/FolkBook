import pytest
from django.core.exceptions import PermissionDenied
from django.core.files.uploadedfile import SimpleUploadedFile

from access.policy import Access
from imports import services
from people.models import Person
from tests.factories import ContactMethodFactory, PersonFactory

VCF = b"""BEGIN:VCARD
VERSION:3.0
FN:Greta Holm
TEL;TYPE=cell:+46 73 111 22 33
EMAIL:greta@example.com
BDAY:1990-06-14
ORG:Acme;
END:VCARD
BEGIN:VCARD
VERSION:3.0
FN:Ines Berg
TEL:070 555 12 90
END:VCARD
BEGIN:VCARD
VERSION:3.0
TEL:+46 70 000 00 00
END:VCARD
"""


def vcf(content: bytes = VCF, name: str = "contacts.vcf") -> SimpleUploadedFile:
    return SimpleUploadedFile(name, content, content_type="text/vcard")


def preview(api, user, upload=None):
    return api.login(user).upload("/imports/preview", {"file": upload or vcf()})


def test_preview_lists_contacts_with_their_matches(api, world):
    response = preview(api, world.ela)

    assert response.status_code == 200
    body = response.json()
    assert (body["file_name"], body["skipped"]) == ("contacts.vcf", 1)
    greta, ines = body["contacts"]
    assert greta == {
        "index": 0,
        "name": "Greta Holm",
        "phones": [{"value": "+46 73 111 22 33", "label": "mobile"}],
        "emails": [{"value": "greta@example.com", "label": ""}],
        "birthday": {"day": 14, "month": 6, "year": 1990},
        "work": "Acme",
        "has_photo": False,
        "match": None,
    }
    match = ines["match"]
    assert match["person"] == {"id": str(world.ines.pk), "name": "Ines"}
    assert (match["reason"], match["sure"], match["by_details"], match["can_merge"]) == (
        "phone",
        True,
        True,
        True,
    )
    assert match["phones"] == ["+46 70 555 12 90"]
    assert [space["name"] for space in match["spaces"]] == ["Climbing club"]
    assert match["owner"] == "Ela"


def test_preview_stores_nothing(api, world):
    people = Person.objects.count()

    preview(api, world.ela)

    assert Person.objects.count() == people


def test_not_a_vcard_is_422(api, world):
    response = preview(api, world.ela, vcf(b"hello"))

    assert response.status_code == 422
    assert response.json()["detail"][0]["msg"] == "That file isn't a .vcf contacts file."


def test_a_file_that_is_too_big(api, world, monkeypatch):
    monkeypatch.setattr(services, "MAX_FILE_BYTES", 10)

    response = preview(api, world.ela)

    assert response.json()["detail"][0]["msg"] == "That file is too big (up to 20 MB)."


def test_too_many_contacts(api, world, monkeypatch):
    monkeypatch.setattr(services, "MAX_CONTACTS", 1)

    response = preview(api, world.ela)

    assert response.status_code == 422
    assert response.json()["detail"][0]["msg"] == "That file has more than 1 contacts."


def test_the_same_file_again_is_already_in_your_book(api, world):
    greta = PersonFactory(owner=world.ela, name="Greta H.")
    ContactMethodFactory(person=greta, value="+46 73 111 22 33")

    contacts = preview(api, world.ela).json()["contacts"]

    assert [contact["match"]["by_details"] for contact in contacts] == [True, True]


def test_needs_full_access(world):
    access = Access.limited(world.ela, include_private=True, read_only=True)

    with pytest.raises(PermissionDenied):
        services.preview(access, vcf())


def test_needs_a_login(api):
    assert api.upload("/imports/preview", {"file": vcf()}).status_code == 401


def test_preview_says_exactly_what_a_merge_would_add(api, world):
    upload = vcf(
        b"BEGIN:VCARD\nVERSION:3.0\nFN:Ines B\nTEL:070 555 12 90\nTEL:+46 70 555 12 90\n"
        b"EMAIL:ines@example.com\nTITLE:Doctor\nBDAY:--0302\nNOTE:Gym\nEND:VCARD\n"
        b"BEGIN:VCARD\nVERSION:3.0\nFN:Tom\nEMAIL:tom@example.com\nEND:VCARD\n"
    )

    ines, tom = preview(api, world.ela, upload).json()["contacts"]

    assert ines["match"]["adds"] == {
        "phones": [],  # the same number, written two ways: already there
        "emails": ["ines@example.com"],
        "work": "Doctor",
        "birthday": {"day": 2, "month": 3, "year": None},
        "photo": False,
        "note": True,
    }
    assert tom["match"]["adds"] is None  # Defne's: can't be merged into
