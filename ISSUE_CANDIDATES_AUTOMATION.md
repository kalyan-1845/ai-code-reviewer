# Issue Candidates

1. Title: test : add unit tests for analyticsStore.js lock and store operations
   Type: test
   Files: backend/utils/analyticsStore.js, backend/tests/analyticsStore.test.js
   Summary: Add unit tests for the analyticsStore.js module which handles persistent analytics trend storage with in-process locking. No test file currently exists for this module.
   Verification: cd backend && npm test -- analyticsStore.test.js
   Conflict risk: low

2. Title: test : add unit tests for reposageIgnore.js parseIgnoreFile and shouldIgnore
   Type: test
   Files: backend/utils/reposageIgnore.js, backend/tests/reposageIgnore.test.js
   Summary: Add unit tests for reposageIgnore.js which parses .reposageignore files and implements glob-to-regex matching for file exclusion decisions. No test file exists for this module.
   Verification: cd backend && npm test -- reposageIgnore.test.js
   Conflict risk: low

3. Title: test : add unit tests for notebookParser.js stripMagicCommands and extractCodeCells
   Type: test
   Files: backend/utils/notebookParser.js, backend/tests/notebookParser.test.js
   Summary: Add unit tests for notebookParser.js which strips IPython magic commands from .ipynb notebook cells and extracts code cells. No test file exists for this module.
   Verification: cd backend && npm test -- notebookParser.test.js
   Conflict risk: low

4. Title: test : add unit tests for reportGenerator.js escapeHtml and report generation
   Type: test
   Files: backend/utils/reportGenerator.js, backend/tests/reportGenerator.test.js
   Summary: Add unit tests for reportGenerator.js which generates JSON and HTML code review reports with HTML escaping and severity categorization. No test file exists for this module.
   Verification: cd backend && npm test -- reportGenerator.test.js
   Conflict risk: low

5. Title: test : add unit tests for dangerousPhrases.js DANGEROUS_PHRASES data validation
   Type: test
   Files: backend/shared/dangerousPhrases.js, backend/tests/dangerousPhrases.test.js
   Summary: Add unit tests for the DANGEROUS_PHRASES data file that stores jailbreak/injection phrase patterns used by the AI engine prompt validation. No test file exists for this data module.
   Verification: cd backend && npm test -- dangerousPhrases.test.js
   Conflict risk: low
