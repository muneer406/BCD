# Release Checklist

## Pre-Release

- [ ] All issues for this milestone are closed
- [ ] All PRs are merged
- [ ] CI is green on master
- [ ] Security audit completed
- [ ] Privacy audit completed
- [ ] Accessibility audit completed

## Version Bump

- [ ] Version updated in `frontend/package.json`
- [ ] Version updated in `backend/pyproject.toml` (if applicable)
- [ ] Changelog updated
- [ ] Tag created: `git tag vX.Y.Z`

## Build

- [ ] Frontend: `npm run build` succeeds
- [ ] Backend: `docker build` succeeds
- [ ] All tests pass
- [ ] AI model evaluation benchmarks pass
- [ ] Bundle size within limits

## Staging Deployment

- [ ] Deployed to staging environment
- [ ] Smoke tests pass
- [ ] E2E tests pass
- [ ] Performance monitoring shows no regression

## Production Deployment

- [ ] Deployed to production
- [ ] Health checks pass
- [ ] Error monitoring shows no new errors
- [ ] Rollback plan documented

## Post-Release

- [ ] Release notes published
- [ ] Users notified (in-app or email)
- [ ] Issues closed for milestone
- [ ] New milestone created for next version

## Emergency Rollback

If the release must be rolled back:
1. `git revert <release-commit>`
2. Re-deploy previous stable version
3. Notify users of service interruption
4. Root cause analysis within 48 hours
