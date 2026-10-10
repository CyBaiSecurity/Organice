This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run `npm test` and `npm run typecheck` before declaring any task done. `npx expo lint` is not configured.

## Organice

- The product rules are in `docs/organice-prd.md`. Do not rewrite that file unless asked.
- Tabs come from `expo-router/js-tabs`. The `Tabs` export on `expo-router` is deprecated in SDK 57. Do not use `expo-router/unstable-native-tabs`.
- Domain modules and `src/db` import each other with a `.ts` extension so `node --experimental-strip-types --test` can resolve them. `allowImportingTsExtensions` is set because typecheck is `noEmit`. Do not add `"type": "module"` to `package.json`.
- `execAsync` is for migrations only. User text is always a bound parameter. Full-text search must go through `ftsQuery`, which quotes each token.
- On SDK 57 the legacy calendar `*Async` methods and the legacy file-system `copyAsync` throw. Use the current calendar methods and `File.copy`.
- `expo-calendar` is not in Expo Go. A development build is required. Do not claim a phone check that was not run.
- Hermes has no `globalThis.crypto`. `newId` must not call `crypto.randomUUID()` unless that function exists.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
