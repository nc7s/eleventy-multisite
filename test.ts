import test from 'ava'
import { execSync } from 'child_process'

test('it runs', t => {
	execSync('yarn run eleventy-multisite')
	t.pass()
})
