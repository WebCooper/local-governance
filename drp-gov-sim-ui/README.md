# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

---

## 🚀 Deploying in Dokploy (Self-Hosted PaaS)

This frontend is pre-configured with a production-ready multi-stage **Dockerfile** and custom **Nginx** configuration (`nginx.conf`) that supports Single-Page Application (SPA) routing and immutable asset caching.

### Step-by-Step Dokploy Setup:

1. **Create Application in Dokploy**:
   - Go to your Dokploy dashboard → **Projects** → Select/Create Project → **Add Application**.
   - Select your Git Provider (GitHub / GitLab / Gitea) and pick the `local-governance` repository.
   - Set **Branch** to your working branch (e.g., `main` or `master`).

2. **Configure Build Settings**:
   - **Build Type**: Select **Dockerfile**.
   - **Build Path / Context**: Set to `drp-gov-sim-ui` (since this is a subdirectory in a monorepo).
   - **Dockerfile Path**: `drp-gov-sim-ui/Dockerfile` (or `Dockerfile` if your Build Context is already `drp-gov-sim-ui`).

3. **Set Build & Runtime Environment Variables**:
   - Under the application's **Environment** tab in Dokploy, add your required Vite environment variables:
     ```env
     VITE_ZKP_SERVER_URL=https://your-zkp-server-domain.com/api
     VITE_FRONTEND_PRIVATE_KEY=your_private_key_here
     VITE_REGISTRATION_SECRET=your_admin_secret_here
     ```
   - *Note*: Because Vite bakes environment variables into the static bundle at build time, Dokploy passes these variables as `--build-arg` to Docker automatically.

4. **Network & Domain Settings**:
   - **Container Port**: Set to **`80`** (Nginx listens on port 80).
   - Under **Domains**, add your custom domain or subdomain (e.g., `drp-gov.yourdomain.com`) and enable HTTPS/SSL (Let's Encrypt).

5. **Deploy**:
   - Click **Deploy**. Dokploy will build the Vite SPA and serve it via Nginx in seconds!

