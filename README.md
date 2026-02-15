# BCD - Breast Changes Detection

[![React](https://img.shields.io/badge/React-18-blue?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-green?logo=supabase)](https://supabase.com)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](#)
[![Status](https://img.shields.io/badge/Status-Phase%201%20Complete-success)](#)

> **A privacy-first visual change awareness tool that helps individuals track breast health changes over time through standardized self-monitoring.**

⚠️ **Disclaimer**: This is an awareness tool, NOT a medical diagnostic device. Always consult healthcare professionals for medical concerns.

---

## 📌 What is BCD?

BCD (Breast Changes Detection) is a time-series visual tracking system that empowers individuals to:

- **Monitor** visual changes through consistent photo documentation
- **Compare** current sessions with personal history using 6-angle captures
- **Detect** subtle changes that might otherwise go unnoticed
- **Decide** when to seek professional medical consultation

### Why BCD Exists

Many breast health concerns are detected late because:

- Regular self-monitoring feels unstructured or unreliable
- Changes happen gradually and are easy to dismiss
- People lack a systematic way to track visual differences over time

BCD provides a **structured, consistent framework** for awareness, bridging the gap between irregular self-checks and clinical screenings.

---

## 💡 Use Cases

### Who Should Use BCD?

| Scenario                          | Frequency        | Benefit                                            |
| --------------------------------- | ---------------- | -------------------------------------------------- |
| **Regular monitoring**            | Monthly          | Establish personal baseline, track normal changes  |
| **Post-surgery follow-up**        | Weekly/Bi-weekly | Monitor healing and recovery progress              |
| **Family history concerns**       | Bi-weekly        | Early awareness for higher-risk individuals        |
| **Noticed something different**   | As needed        | Document changes to share with healthcare provider |
| **Between clinical appointments** | Monthly          | Maintain awareness during 6-12 month gaps          |

### When to Use BCD

- **Ideal**: Monthly captures at the same phase of your cycle
- **Consistency matters**: Same lighting, distance, and time of day
- **More data = better trends**: Multiple images per angle improve detection

---

## 🎯 How It Works

### The Process

```
Sign Up → Accept Disclaimer → Capture 6 Angles → Save Session → View Results → Compare History
```

### 6-Angle Capture Protocol

Each session requires captures from **all 6 standardized angles**:

| Angle                 | Position                         | Purpose                     |
| --------------------- | -------------------------------- | --------------------------- |
| 🎯 **Front view**     | Arms at sides, shoulders relaxed | Baseline symmetry reference |
| ⬅️ **Left side**      | 90° turn, steady posture         | Left side profile           |
| ➡️ **Right side**     | 90° turn, steady posture         | Right side profile          |
| ⬆️ **Upward angle**   | Camera below, tilted up          | Underside perspective       |
| ⬇️ **Downward angle** | Camera above, tilted down        | Top-down view               |
| 🧍 **Full body**      | Step back for full torso         | Overall proportions         |

**Pro Tip**: Capture **multiple images per angle** for better accuracy, the system uses all images for comparison.

---

## 🚀 Getting Started

### For Users

1. Visit the [web app](https://bcd-dev.vercel.app)
2. Sign up with email/password
3. Read and accept the disclaimer
4. Capture your first session (6 angles)
5. Return monthly to compare progress

### For Developers

```bash
# Clone repository
git clone https://github.com/muneer406/BCD.git
cd BCD/frontend

# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
# Add your Supabase credentials

# Run development server
npm run dev

# Then setup Supabase
```

---

## 🔐 Privacy & Security

| Feature            | Implementation                                                          |
| ------------------ | ----------------------------------------------------------------------- |
| **Authentication** | Supabase Auth with email/password                                       |
| **Data Isolation** | Row-Level Security (RLS) policies                                       |
| **Image Storage**  | Private bucket with signed URLs (temporary, metadata will replace this) |
| **Access Control** | Users can only see their own data                                       |
| **Encryption**     | HTTPS in transit, encrypted at rest                                     |

**Privacy Promise**: Your images are stored securely, never shared, and completely isolated from other users. You own your data.

---

## 🛠️ Tech Stack

### Frontend

- **React 18** + **TypeScript** : Type-safe UI components
- **Vite** : Lightning-fast development
- **Tailwind CSS** : Utility-first styling
- **React Router** : Client-side navigation
- **Supabase JS** : Authentication & storage client

### Backend (Phase 2)

- **FastAPI** : Python async web framework
- **ML Models** : Anomaly detection pipeline
- **PostgreSQL** : Time-series data storage

### Hosting

- Frontend: Vercel
- Database: Supabase (PostgreSQL)
- Storage: Supabase Storage (S3-compatible)

---

## 📊 Current Status

### ✅ Phase 1 - Complete (February 2026)

- [x] User authentication & authorization
- [x] Disclaimer acceptance flow
- [x] 6-angle image capture interface
- [x] Session management & history
- [x] Secure image storage with RLS
- [x] Responsive UI for mobile & desktop

### 🚧 Phase 2 - Coming Next

- [ ] Backend API for image processing
- [ ] ML anomaly detection model
- [ ] Session comparison algorithm
- [ ] Change visualization dashboard

### 🔮 Phase 3 - Future

- [ ] Mobile app (React Native)
- [ ] Export reports for doctors
- [ ] Trend graphs & analytics
- [ ] Multi-language support

---

## 📁 Project Structure

```
BCD/
├── frontend/                    # React + TypeScript UI
│  ├── src/
│  │  ├── components/           # Reusable UI components
│  │  ├── pages/                # Route pages
│  │  ├── context/              # Auth & state management
│  │  └── lib/                  # Supabase client
│  ├── DEVELOPMENT.md           # Frontend setup guide
│  └── package.json
│
├── backend/                     # (Phase 2) FastAPI server
│  └── DEVELOPMENT.md           # Backend setup guide
│
├── Docs/                        # Technical specifications (legacy)
├── ARCHITECTURE.md             # System design & data flow
├── API_INTEGRATION.md          # Frontend-Backend contract
├── SUPABASE_MIGRATIONS.sql     # Database schema
└── README.md
```

---

## 📖 Documentation

### Comprehensive Guides

- **[ARCHITECTURE.md](ARCHITECTURE.md)** : System design, data flow, component hierarchy
- **[API_INTEGRATION.md](API_INTEGRATION.md)** : Frontend-Backend API contract (Phase 2)
- **[frontend/DEVELOPMENT.md](frontend/DEVELOPMENT.md)** : Frontend setup, workflow, code structure
- **[backend/DEVELOPMENT.md](backend/DEVELOPMENT.md)** : Backend setup guide (Phase 2)

### Additional Resources

- **[frontend/README.md](frontend/README.md)** : Frontend quick start
- **[SUPABASE_MIGRATIONS.sql](SUPABASE_MIGRATIONS.sql)** : Database schema and migrations

---

## 🤝 Contributing

Contributions welcome! Please:

1. Follow the existing code style
2. Maintain neutral, non-diagnostic language
3. Test thoroughly with multiple users
4. Update documentation

---

## 📜 License

MIT License : See [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

Built with:

- [Supabase](https://supabase.com) : Open-source Firebase alternative
- [React](https://react.dev) : UI library
- [Tailwind CSS](https://tailwindcss.com) : CSS framework
- [Vite](https://vitejs.dev) : Build tool

---

## 📞 Contact & Support

- **Issues**: [GitHub Issues](https://github.com/muneer406/BCD/issues)
- **Discussions**: [GitHub Discussions](https://github.com/muneer406/BCD/discussions)
- **Email**: muneer.alam320@gmail.com

---

**Making breast health awareness accessible, one session at a time.** 💙
