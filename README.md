# L9itha

L9itha is a multilingual lost-and-found platform designed for Tunisia. People can publish something they found or lost, search by a person's name, item, description, or location, and contact the person who posted it.

## Features

- Post found or lost documents, keys, phones, wallets, bags, pets, and other items
- Search and filter real community posts by name, item, category, status, and location
- Optional photo uploads with privacy guidance for identity documents
- Browser-based OCR for reading Arabic, French, and English names from documents
- Optional public contact methods: phone, Facebook, and Instagram
- Private ownership-claim flow for sensitive items
- English, French, Arabic, and Tunisian/Arabizi interfaces
- Responsive layout with Arabic right-to-left support
- No built-in sample listings or invented community statistics

## Run locally

Requirements: Node.js 20 or newer and npm.

```bash
npm install
npm run dev
```

Open the local address printed by Vite, normally `http://localhost:5173`.

## Available commands

```bash
npm run dev      # Start the development server
npm run lint     # Run ESLint
npm run build    # Type-check and create a production build
npm run preview  # Preview the production build
```

## Privacy

Identity numbers, addresses, signatures, QR codes, and barcodes should never be published. The posting form reminds finders to crop or cover private document information before uploading a photo. OCR runs in the browser, but its result should always be checked manually.

Contact details added to a post are public by design and are always optional.

## Current project status

This repository currently contains the working front-end prototype. Posts and uploaded images are stored in the visitor's browser using local storage, so they are not yet shared between different users or devices.

A production release will need a shared database, image storage, authentication, moderation, abuse reporting, and server-side privacy protections.

## Technology

- React
- TypeScript
- Vite
- Tesseract.js
- Lucide icons
