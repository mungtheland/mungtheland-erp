# Guardian activation test integration checklist

Branch: feature/guardian-request-prototype. Never deploy to production.

The following two source files were added after the last successful 14-source build:
- src/GuardianActivationTest.js -> GuardianActivationService.gs
- tests/GuardianActivationTest.js -> GuardianActivationTest.gs

Both must be included in the isolated test build manifest (16 source files total) with unique output names. Keep the existing appsscript.json unchanged.

## Safe execution order
1. Run syntax checks and isolated bundle build.
2. Upload only to the existing independent guardian test Apps Script project.
3. Ensure runGuardianEnrollmentTest previously passed; it already did for CUS-TEST-001.
4. Run runGuardianActivationTest exactly once and capture its log.
5. Do not expose activation, test fixture, invitation issuance or staff-verification internals via web endpoints.

Expected checks: verified enrollment required, browser activation rejected, activation recorded, replay rejected, login remains disabled.

Important limitations: The current trustedProvisioning object is a synthetic test assertion, not a cryptographically verified credential-provider result. This code must never be wired to public callers or treated as production authentication. A real account credential provider, identity enrollment and verified staff authentication are still required.
