/** Ids for a person's shared elements, so a card and their profile always match. */
export const sharedPerson = {
  photo: (personId: string) => `person-${personId}-photo`,
  name: (personId: string) => `person-${personId}-name`,
}
