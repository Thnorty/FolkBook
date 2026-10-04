from django.db import connection
from django.test.utils import CaptureQueriesContext

from exports.vcard import escape, fold, name_parts
from people.models import HiddenPerson
from tests.factories import ContactMethodFactory, PersonFactory


def vcf(client, **params) -> str:
    response = client.get("/export/contacts", **params)
    assert response.status_code == 200
    return response.content.decode()


def cards(text: str) -> dict[str, list[str]]:
    """Each card's lines (folds undone), by its FN."""
    found: dict[str, list[str]] = {}
    for block in text.split("BEGIN:VCARD\r\n")[1:]:
        lines = block.replace("\r\n ", "").split("\r\n")
        name = next(line[3:] for line in lines if line.startswith("FN:"))
        found[name] = lines
    return found


# ---------------------------------------------------------------- the format


def test_text_is_escaped():
    assert escape("Smith, Jr.; a\\b\nc") == "Smith\\, Jr.\\; a\\\\b\\nc"


def test_long_lines_fold_without_splitting_a_character():
    line = "NOTE:" + "ş" * 60  # 2 bytes each
    folded = fold(line)

    assert folded.replace("\r\n ", "") == line
    assert all(len(part.encode()) <= 75 for part in folded.split("\r\n"))


def test_the_last_word_is_the_family_name():
    assert name_parts("Emma Yılmaz") == ("Yılmaz", "Emma")
    assert name_parts("Ayşe Nur Şen") == ("Şen", "Ayşe Nur")
    assert name_parts("Mira") == ("", "Mira")


# ---------------------------------------------------------------- the file


def test_a_card_per_person_with_phone_email_and_birthday(api, world):
    world.emma.name = "Emma Yılmaz"
    world.emma.birth_day, world.emma.birth_month, world.emma.birth_year = 3, 4, 1992
    world.emma.save()
    ContactMethodFactory(person=world.emma, kind="phone", label="Mobile", value="+90 532 1")
    ContactMethodFactory(person=world.emma, kind="email", label="work", value="emma@x.test")
    ContactMethodFactory(person=world.emma, kind="social", value="@emma")

    response = api.login(world.ela).get("/export/contacts")
    emma = cards(response.content.decode())["Emma Yılmaz"]

    assert response["Content-Type"] == "text/vcard; charset=utf-8"
    assert 'filename="FolkBook contacts.vcf"' in response["Content-Disposition"]
    assert "N:Yılmaz;Emma;;;" in emma
    assert "TEL;TYPE=CELL:+90 532 1" in emma
    assert "EMAIL;TYPE=INTERNET,WORK:emma@x.test" in emma
    assert "BDAY:1992-04-03" in emma
    assert not any("@emma" in line for line in emma)  # phone and email only


def test_a_birthday_without_a_year(api, world):
    world.emma.birth_day, world.emma.birth_month = 14, 6
    world.emma.save()

    emma = cards(vcf(api.login(world.ela)))["Emma"]

    assert "BDAY;X-APPLE-OMIT-YEAR=1604:1604-06-14" in emma


def test_everyone_you_see_but_not_you(api, world):
    found = cards(vcf(api.login(world.ela)))

    # Your own people, and the people shared with you; Defne and Ela's members too.
    assert {"Emma", "Oskar", "Ines", "Tom", "Ola"} <= set(found)
    assert "Ela" not in found
    assert "Jin" not in found  # Defne's, not in a space Ela sees
    assert "Yuki" not in found  # Deniz's


def test_people_taken_out_of_your_book_stay_out(api, world):
    HiddenPerson.objects.create(user=world.ela, person=world.tom)

    assert "Tom" not in cards(vcf(api.login(world.ela)))


def test_shared_contact_details_only_when_the_space_shares_them(api, world):
    deniz = api.login(world.deniz)
    assert not any(line.startswith("TEL") for line in cards(vcf(deniz))["Ines"])

    world.climbing.share_contact_details = True
    world.climbing.save()

    assert "TEL:+46 70 555 12 90" in cards(vcf(deniz))["Ines"]


def test_one_space(api, world):
    response = api.login(world.ela).get("/export/contacts", space=str(world.climbing.pk))
    found = cards(response.content.decode())

    assert set(found) == {"Oskar", "Ines"}
    assert "Climbing club.vcf" in response["Content-Disposition"]


def test_a_space_you_cant_see_is_not_found(api, world):
    response = api.login(world.sofia).get("/export/contacts", space=str(world.climbing.pk))

    assert response.status_code == 404


def test_needs_a_login(api):
    assert api.get("/export/contacts").status_code == 401


def test_query_count_does_not_grow_with_the_book(api, world):
    client = api.login(world.ela)

    def queries():
        with CaptureQueriesContext(connection) as captured:
            vcf(client)
        return len(captured)

    before = queries()
    for _ in range(10):
        ContactMethodFactory(person=PersonFactory(owner=world.ela))

    assert queries() == before
