import { test, expect } from '@playwright/test'
import { auditFilm, formatAudit } from '../src/thermopylae/choreography'

// Every figure, every frame: troops walk, run, turn and fight like men, keep
// their formations, stay on land and out of each other. See choreography.ts.
test('troop movement passes the choreography audit', () => {
  test.setTimeout(300_000)
  const audit = auditFilm()
  console.log(formatAudit(audit))
  expect(audit.failures, audit.failures.join('\n')).toEqual([])
})
