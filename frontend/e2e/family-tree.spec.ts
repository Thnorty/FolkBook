import { ACCOUNTS, unique } from './accounts.ts'
import { addPerson, connect, expect, submitButton, test } from './fixtures.ts'

test('Ela opens a family tree from a profile and adds a missing parent', async ({
  as,
}, testInfo) => {
  const lina = unique('Lina')
  const mateo = unique('Mateo')

  const ela = await as('ela')
  await addPerson(ela, testInfo, lina)
  // Ela is Lina's parent ("Parent of Lina": the one picked is the parent).
  await connect(ela, testInfo, ACCOUNTS.ela.name, /^Parent of/)

  await ela.getByRole('link', { name: 'View family tree' }).click()
  const tree = ela.getByRole('region', { name: 'Family tree' })
  await expect(tree.getByRole('button', { name: lina, exact: true })).toBeVisible()
  const me = tree.getByRole('button', { name: `${ACCOUNTS.ela.name}, Me` })
  await expect(me).toBeVisible()

  // Lina has one parent: one slot for the other.
  const slot = tree.getByRole('button', { name: `Add parent of ${lina}` })
  await expect(slot).toHaveCount(1)
  await slot.click()
  const dialog = ela.getByRole('dialog')
  await dialog.getByLabel('Who?').fill(mateo)
  await dialog.getByRole('button', { name: `Create “${mateo}” as a new person` }).click()
  await submitButton(ela, testInfo, { desktop: 'Connect them', phone: 'Connect' }).click()
  await expect(dialog).toHaveCount(0)

  // Mateo is drawn in the parents' row, next to Ela, and the slot is gone.
  const parent = tree.getByRole('button', { name: `${mateo}, parent` })
  await expect(parent).toBeVisible()
  await expect(slot).toHaveCount(0)
  const [mateoBox, meBox] = [await parent.boundingBox(), await me.boundingBox()]
  expect(Math.round(mateoBox!.y)).toBe(Math.round(meBox!.y))
})
