# IFOA - Automated Certificate Generation System

A web application that streamlines the flight dispatcher training certification process. Generate EASA-compliant certificates for Dispatch Graduate, Human Factors, and Recurrent training programs in seconds.

![Node.js](https://img.shields.io/badge/Node.js-22-green)
![React](https://img.shields.io/badge/React-18-blue)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-brightgreen)
![License](https://img.shields.io/badge/License-MIT-yellow)

## About

IFOA (International Flight Operations Academy) Certificate System automates the generation of professional PDF certificates for flight dispatcher training programs. It replaces the manual process of creating certificates by allowing administrators to manage participant records and generate EASA-standard compliant certificates instantly.

The system supports three training types:
- **Dispatch Graduate** — Full dispatcher certification
- **Human Factors** — Human performance and limitations training
- **Recurrent Training** — Ongoing certification with 12 selectable training modules

Certificates are generated following ICAO Doc 10106, Doc 9868, and EASA Part ORO.GEN.110(c) standards.

## Features

- **Participant Management** — Add, edit, search, and manage training participant records
- **Instant Certificate Generation** — Generate professional PDF certificates from EASA-standard templates
- **Training Module Tracking** — Select from 12 training modules for recurrent dispatcher certification
- **Admin Authentication** — Secure signup/login with JWT-based authentication
- **Responsive Dashboard** — Overview of records, training types, and recent activity
- **Profile Management** — Update admin name and password

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 18, Vite, Tailwind CSS, React Router, Framer Motion, Axios |
| **Backend** | Node.js, Express.js, Mongoose |
| **Database** | MongoDB Atlas |
| **PDF Engine** | pdf-lib, PDFKit |
| **Auth** | JWT, bcryptjs |

## Project Structure

```
├── backend/
│   ├── server.js              # Express server & route setup
│   ├── database.js            # MongoDB connection
│   ├── models/
│   │   ├── Admin.js           # Admin user schema
│   │   └── Participant.js     # Training participant schema
│   ├── routes/
│   │   ├── auth.js            # Authentication endpoints
│   │   ├── participants.js    # Participant CRUD endpoints
│   │   └── certificates.js    # Certificate generation endpoints
│   ├── services/
│   │   └── certificateGenerator.js  # PDF generation logic
│   └── templates/             # EASA certificate PDF templates
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx            # Routing & protected routes
│   │   ├── api.js             # API client functions
│   │   ├── context/
│   │   │   └── AuthContext.jsx # Auth state management
│   │   ├── pages/
│   │   │   ├── LandingPage.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Participants.jsx
│   │   │   ├── Certificates.jsx
│   │   │   ├── Profile.jsx
│   │   │   ├── Login.jsx
│   │   │   └── Signup.jsx
│   │   └── components/
│   │       ├── Header.jsx
│   │       ├── Sidebar.jsx
│   │       └── Layout.jsx
│   └── vite.config.js
```

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB Atlas account (or local MongoDB)
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Arjun-SN04/Automated-Certificate-Generation-System.git
   cd Automated-Certificate-Generation-System
   ```

2. **Set up the backend**
   ```bash
   cd backend
   npm install
   ```

3. **Create environment file**

   Create a `.env` file in the `backend/` directory:
   ```
   MONGODB_URL=your_mongodb_atlas_connection_string
   JWT_SECRET=your_secret_key
   PORT=5000
   ```

4. **Set up the frontend**
   ```bash
   cd ../frontend
   npm install
   ```

5. **Run the application**

   Start the backend:
   ```bash
   cd backend
   npm run dev
   ```

   Start the frontend (in a new terminal):
   ```bash
   cd frontend
   npm run dev
   ```

6. Open `http://localhost:3000` in your browser

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/signup` | Register new admin |
| POST | `/api/auth/login` | Admin login |
| GET | `/api/auth/me` | Get current admin profile |
| PUT | `/api/auth/profile` | Update name/password |
| GET | `/api/participants` | List participants (with search/filter) |
| POST | `/api/participants` | Create participant |
| GET | `/api/participants/:id` | Get participant details |
| PUT | `/api/participants/:id` | Update participant |
| DELETE | `/api/participants/:id` | Delete participant |
| GET | `/api/certificates/generate/:id` | Download certificate PDF |
| GET | `/api/certificates/preview/:id` | Preview certificate |
| POST | `/api/certificates/generate/:id` | Generate with selected modules |
| GET | `/api/certificates/modules` | List available training modules |

## Training Modules

The recurrent training program includes 12 modules:

Air Law • Aircraft Systems • Navigation • Meteorology • Flight Planning • Human Performance • Mass & Balance • Operational Procedures • Communications • General Navigation • Radio Navigation • Principles of Flight

## Deployment

This project is configured for deployment on [Render](https://render.com):

- **Build Command**: `cd frontend && npm install --include=dev && npm run build && cd ../backend && npm install`
- **Start Command**: `cd backend && node server.js`
- **Environment Variables**: `NODE_ENV`, `MONGODB_URL`, `JWT_SECRET`

## License

This project is licensed under the MIT License.
