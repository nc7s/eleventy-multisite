import test from 'ava'
import { rmSync } from 'fs'
import { execSync } from 'child_process'

test('it runs', t => {
	execSync('npm exec eleventy-multisite -- -b fixtures')
	rmSync('./_out', { recursive: true })
	t.pass()
})
