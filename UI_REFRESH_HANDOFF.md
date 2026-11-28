# UI refresh handoff

## Rider app
- Branch: `ui/rider-experience-refresh`
- `partner-ui-refresh.js` has additive mobile/touch/accessibility polish for the existing shift-controls accordion.
- Verify the app's HTML loads `partner-ui-refresh.js` after its base theme styles before deployment.

## Vendor dashboard
- Branch: `ui/vendor-dashboard-refresh`
- `vendor-ui-refresh.js` provides additive responsive layout, focus-visible, and touch/readability styling. It does not alter order or database behavior.
- Before deployment, load it from `index.html` after the existing app scripts, for example with `<script defer src="./vendor-ui-refresh.js"></script>`. Then run the repository checks and manually exercise sign-in, navigation, order actions, menu, and mobile layout.

## Safety
- These changes are isolated on feature branches; do not deploy directly from `main`.
- No backend schema, auth, order transitions, dispatch, or vendor data behavior is changed.
