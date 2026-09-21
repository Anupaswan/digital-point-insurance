# Digital Point Insurance Website

Full-stack responsive website for Digital Point, Akhlaspur, Bhabua.

## Features
- Responsive Hindi/English frontend
- Services, vehicle categories, contact details and poster image
- Call and WhatsApp links
- Backend inquiry API using Express
- Inquiry records saved locally in `data/leads.json`

## Run locally
1. Install Node.js 18+
2. Open terminal in this folder
3. Run `npm install`
4. Run `npm start`
5. Open `http://localhost:3000`

## API
- `GET /api/health`
- `POST /api/inquiries`

For production, replace JSON storage with a database and add authentication/admin controls before exposing inquiry records.
