// jest 29 exposes the path filter as `testPathPattern` (string), jest 30 as `testPathPatterns`
// (array). The client is on 29 and the API on 30, so both spellings have to be read.
function isFilteredRun(globalConfig) {
  if (!globalConfig) return false;
  return Boolean(
    globalConfig.testNamePattern ||
      globalConfig.onlyChanged ||
      globalConfig.findRelatedTests ||
      globalConfig.testPathPattern ||
      (Array.isArray(globalConfig.testPathPatterns) && globalConfig.testPathPatterns.length > 0),
  );
}

class SuiteIntegrityReporter {
  constructor(globalConfig) {
    this.filtered = isFilteredRun(globalConfig);
    this.failure = undefined;
  }

  onRunComplete(_contexts, results) {
    const problems = [];

    if (results.numTotalTests === 0) {
      problems.push('the run contained no tests at all');
    }

    // A filtered run (`jest -t`, a path argument, --onlyChanged) reports every unselected test as
    // pending by design. Enforcing the skip rules there would make ordinary local filtering fail,
    // so only an unfiltered run — which is what CI runs — is held to them.
    if (!this.filtered) {
      if (results.numPendingTests > 0) {
        problems.push(`${results.numPendingTests} test(s) were skipped`);
      }
      if (results.numTodoTests > 0) {
        problems.push(`${results.numTodoTests} test(s) were marked todo`);
      }

      const emptySuites = results.testResults
        .filter((suite) => !suite.testExecError && suite.testResults.length === 0)
        .map((suite) => suite.testFilePath);
      if (emptySuites.length > 0) {
        problems.push(`suite(s) ran no test: ${emptySuites.join(', ')}`);
      }
    }

    if (problems.length > 0) {
      const message =
        `Suite integrity check failed — ${problems.join('; ')}. ` +
        'A run that asserts nothing must not be reported as a pass.';
      process.stderr.write(`\n${message}\n\n`);
      this.failure = new Error(message);
    }
  }

  // Jest fails a run only on an error returned from here; throwing from onRunComplete is
  // swallowed and the process still exits 0. Jest does not print this error, hence the
  // explicit write above.
  getLastError() {
    return this.failure;
  }
}

module.exports = SuiteIntegrityReporter;
