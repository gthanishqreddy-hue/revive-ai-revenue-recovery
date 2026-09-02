// Unified test runner executing both unit tests and production acceptance suites

import { executeAllTests } from './test-ai-engine'
import { runAcceptanceSuite } from './test-production-acceptance'

async function runAll() {
  console.log('🏁 STARTING FULL TEST RUN...\n')
  const r1 = await executeAllTests()
  console.log('\n' + '─'.repeat(70) + '\n')
  const r2 = await runAcceptanceSuite()

  const totalPassed = r1.passed + r2.passed
  const totalFailed = r1.failed + r2.failed

  console.log('╔════════════════════════════════════════════════════════════════════╗')
  console.log(`║ 🏁 GRAND TOTAL: ${totalPassed} PASSED, ${totalFailed} FAILED                                  ║`)
  console.log('╚════════════════════════════════════════════════════════════════════╝\n')

  if (totalFailed > 0) {
    process.exit(1)
  }
}

runAll()
