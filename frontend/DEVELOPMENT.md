# Frontend Development Guide

This guide covers setup, development workflow, and code conventions for the BCD frontend.

---

## Quick Start

### Prerequisites

- **Node.js** 18+
- **npm** or **yarn**
- **Git**
- Supabase account with project created

### Setup

```bash
# Clone repository
git clone https://github.com/muneer406/BCD.git
cd BCD/frontend

# Install dependencies
npm install

# Create environment file
cp .env.example .env.local
```

### Environment Configuration

Create `.env.local` with your Supabase credentials:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Get these from your Supabase project:

1. Go to **Settings > API**
2. Copy `Project URL` and `anon` key
3. Paste into `.env.local`

### Start Development Server

```bash
npm run dev
```

Server runs at `http://localhost:5173`

---

## Available Scripts

```bash
# Development server with hot reload
npm run dev

# Build for production
npm run build

# Preview production build locally
npm run preview

# Run ESLint to check code style
npm lint
```

---

## Project Structure

```
src/
├── App.tsx                 # Route definitions, auth guards
├── main.tsx                # Entry point
├── index.css               # Global Tailwind imports
├── App.css                 # Top-level styles
├── assets/                 # Static files
│
├── pages/                  # Route components
│  ├── Landing.tsx
│  ├── Login.tsx
│  ├── Signup.tsx
│  ├── Disclaimer.tsx
│  ├── Capture.tsx
│  ├── Review.tsx
│  ├── Result.tsx
│  ├── History.tsx
│  └── NotFound.tsx
│
├── components/             # Reusable UI components
│  ├── Button.tsx           # Primary, outline, ghost variants
│  ├── Card.tsx             # Content container
│  ├── ImageModal.tsx       # Click-to-expand overlay
│  ├── PageShell.tsx        # Max-width wrapper
│  ├── AppHeader.tsx        # Navigation bar
│  ├── RouteGuards.tsx      # Auth/disclaimer protection
│  └── SectionHeading.tsx   # Page title + description
│
├── context/                # State management
│  ├── AuthContext.tsx      # User + auth state
│  ├── DraftContext.tsx     # Session draft state
│  └── SessionCacheContext.tsx # History cache (in-memory)
│
├── lib/                    # Utilities
│  └── supabaseClient.ts    # Supabase client setup
│
└── data/                   # Static data
   └── captureSteps.ts      # 6-angle definitions
```

---

## Core Concepts

### Routing

Defined in `App.tsx` using React Router v7:

```tsx
<Routes>
  <Route path="/" element={<Landing />} />
  <Route path="/login" element={<Login />} />
  <Route path="/signup" element={<Signup />} />
  <Route element={<RequireAuth />}>
    <Route element={<RequireDisclaimer />}>
      <Route path="/disclaimer" element={<Disclaimer />} />
      <Route path="/capture" element={<Capture />} />
      <Route path="/result" element={<Result />} />
      <Route path="/result/:sessionId" element={<Result />} />
      <Route path="/history" element={<History />} />
    </Route>
  </Route>
  <Route path="*" element={<NotFound />} />
</Routes>
```

### Protected Routes

**RequireAuth**: Redirects to `/login` if not logged in
**RequireDisclaimer**: Redirects to `/disclaimer` if disclaimer not accepted

```tsx
// Usage
<Route element={<RequireAuth />}>{/* Protected pages here */}</Route>
```

### Authentication Flow

1. **Signup/Login**: Email + password via Supabase Auth
2. **JWT Token**: Stored in localStorage
3. **Auto-refresh**: Token refreshed on app load in AuthContext
4. **User object**: Available via `useAuth()` hook
5. **Inactivity timeout**: Auto sign-out after 30 minutes of no activity

```tsx
import { useAuth } from "../context/AuthContext";

export function MyComponent() {
  const { user, loading, logout } = useAuth();

  if (loading) return <div>Loading...</div>;
  if (!user) return <div>Not logged in</div>;

  return <div>Welcome, {user.email}</div>;
}
```

### Draft Management

Captures in progress are stored in DraftContext until saved:

```tsx
import { useDraft } from "../context/DraftContext";

export function CaptureComponent() {
  const { images, setImage, removeImage, clearDraft } = useDraft();

  // images: { type, label, file, previewUrl }[]
}
```

---

## Development Workflow

### Adding a New Page

1. Create component in `src/pages/NewPage.tsx`
2. Import and add route in `App.tsx`
3. Add navigation link in `AppHeader.tsx` if needed
4. Use `PageShell` component for consistent layout:

```tsx
import { PageShell } from "../components/PageShell";
import { SectionHeading } from "../components/SectionHeading";

export function NewPage() {
  return (
    <PageShell className="space-y-10">
      <SectionHeading
        eyebrow="Section label"
        title="Page title"
        description="Descriptive text"
      />
      {/* Content here */}
    </PageShell>
  );
}
```

### Creating a Reusable Component

Place in `src/components/` with clear props interface:

```tsx
interface MyComponentProps {
  label: string;
  onClick: () => void;
  variant?: "primary" | "outline";
}

export function MyComponent({
  label,
  onClick,
  variant = "primary",
}: MyComponentProps) {
  return (
    <button onClick={onClick} className={`...`}>
      {label}
    </button>
  );
}
```

### Styling with Tailwind

- Use utility-first approach
- Define reusable classes in component files or `index.css`
- Color palette: `tide-*`, `sand-*`, `ink-*`
- Spacing: Tailwind spacing scale (4px base unit)

```tsx
<div className="rounded-2xl bg-sand-50 p-4 shadow-lift">Content</div>
```

---

## Working with Supabase

### Querying Data

```tsx
import { supabase } from "../lib/supabaseClient";

const { data, error } = await supabase
  .from("sessions")
  .select("*")
  .eq("user_id", user.id)
  .order("created_at", { ascending: false })
  .limit(10);
```

### Uploading Images

```tsx
const path = `${user.id}/${sessionId}/${imageType}_${timestamp}.jpg`;

const { error } = await supabase.storage.from("bcd-images").upload(path, file);
```

### Generating Signed URLs

```tsx
const { data, error } = await supabase.storage
  .from("bcd-images")
  .createSignedUrl(storagePath, 3600); // 1 hour expiry

const signedUrl = data?.signedUrl;
```

---

## Code Style

### TypeScript

- Use strict mode (`strict: true` in tsconfig.json)
- Define interfaces for component props
- Avoid `any` types
- Use `undefined` over `null` when possible

### Naming Conventions

- **Components**: PascalCase (`MyComponent.tsx`)
- **Functions**: camelCase (`handleClick`, `fetchData`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_RETRIES`)
- **Classes**: PascalCase (`UserService`)

### File Organization

- One component per file (unless very small)
- Related utilities in the same directory
- Index files to export from directories

```tsx
// components/index.ts (optional, for cleaner imports)
export { Button } from "./Button";
export { Card } from "./Card";
export type { ButtonProps } from "./Button";
```

---

## Testing Guidelines

### Manual Testing Checklist

- [ ] Auth flow (signup, login, logout)
- [ ] Disclaimer acceptance gate
- [ ] 6-angle capture (all angles required)
- [ ] Image upload and storage
- [ ] Session save and redirect to result
- [ ] Result page displays session and comparisons
- [ ] History pagination works
- [ ] Responsive design on mobile
- [ ] Signed URLs generate and expire correctly

### Mobile Testing

```bash
# Get your machine's IP
ipconfig getifaddr en0  # macOS
ipconfig                # Windows (find IPv4)

# Start dev server on 0.0.0.0
npm run dev -- --host

# Access from mobile
http://{your-ip}:5173
```

---

## Common Issues & Solutions

### Supabase Client Not Initialized

**Problem**: `supabase is not defined`

**Solution**: Import from correct path:

```tsx
import { supabase } from "../lib/supabaseClient";
```

### Images Not Uploading

**Problem**: 404 or permission denied errors

**Solution**:

1. Check bucket name: `bcd-images`
2. Verify RLS policies allow uploads:
   ```sql
   select * from storage.buckets where name = 'bcd-images';
   ```
3. Check user_id in storage path

### Signed URLs Expired

**Problem**: Images return 403 after 1 hour

**Solution**: Generate new signed URLs on-demand (current implementation)

### Hot Reload Not Working

**Problem**: Changes don't reflect in browser

**Solution**:

1. Check if Vite dev server is running
2. Try hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
3. Restart: `npm run dev`

---

## Git Workflow

```bash
# Create feature branch
git checkout -b feature/description

# Make changes and commit
git add src/pages/NewPage.tsx
git commit -m "Add new page with descriptive message"

# Push to GitHub
git push origin feature/description

# Pull latest changes
git pull origin master
```

### Commit Message Guidelines

```
feat: Add 6-angle capture interface
fix: Correct image storage path
refactor: Simplify auth context logic
docs: Update development guide
style: Adjust button spacing
```

---

## Environment Variables

### Available Variables

| Variable                 | Purpose              | Example                   |
| ------------------------ | -------------------- | ------------------------- |
| `VITE_SUPABASE_URL`      | Supabase project URL | `https://xxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Public API key       | `eyJ...`                  |

### Adding New Variables

1. Create in `.env.local`
2. Reference with `import.meta.env.VITE_*`
3. Add to `.env.example` for documentation

```tsx
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
```

---

## Performance Tips

### Image Optimization

- Lazy load images: `loading="lazy"`
- Use thumbnails for previews
- Compress before upload

### Code Splitting

- React Router automatically code-splits routes
- Use React.lazy() for component lazy loading

### Bundle Size

Check current bundle:

```bash
npm run build
# See dist/ folder sizes
```

---

## Resources

- [React Documentation](https://react.dev)
- [TypeScript Handbook](https://www.typescriptlang.org/docs)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [React Router](https://reactrouter.com)
- [Supabase JS Client](https://supabase.com/docs/reference/javascript/introduction)
- [Vite Documentation](https://vitejs.dev/guide/)

---

## Getting Help

- Check existing issues on GitHub
- Review code comments in components
- Refer to ARCHITECTURE.md for system design
- Ask in GitHub Discussions
