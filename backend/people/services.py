from people.models import Person


def create_me_person(user, name: str) -> Person:
    """Create the person that represents `user` in their own book."""
    return Person.objects.create(owner=user, account=user, name=name)
