# Tenant Property Manager — SaaS Setup Guide

A full property management SaaS: tenant tracking, damages, service requests,
rent & fees, HOA charges, and move-out deposit checklists — with user accounts,
cloud storage, and multi-device access.

---

## Tech Stack

| Layer       | Service          | Free Tier |
|-------------|------------------|-----------|
| Frontend    | React + Vite     | —         |
| Auth        | Supabase Auth    | ✅ Yes    |
| Database    | Supabase (Postgres) | ✅ Yes |
| File Storage| Supabase Storage | ✅ Yes    |
| Hosting     | Vercel           | ✅ Yes    |

Estimated monthly cost to run: **$0** on free tiers for small usage.

---

## Step 1 — Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and sign up (free)
2. Click **New Project**, give it a name like `tenant-pm`, choose a region, set a password
3. Wait ~2 minutes for it to provision
4. Go to **Settings → API** and copy:
   - **Project URL** (looks like `https://xxxx.supabase.co`)
   - **anon/public key** (long string starting with `eyJ...`)

---

## Step 2 — Set Up the Database

1. In your Supabase project, go to **SQL Editor**
2. Click **New Query**
3. Copy the entire contents of `supabase/schema.sql` from this project
4. Paste it and click **Run**
5. You should see "Success. No rows returned"

---

## Step 3 — Set Up Storage

1. In Supabase, go to **Storage**
2. Click **New Bucket**, name it `tenant-media`
3. Check **Public bucket** (so images can be displayed)
4. Click **Create bucket**
5. Go to **Storage → Policies** and add this policy on the `tenant-media` bucket:
   - Policy name: `Users manage own media`
   - Allowed operations: SELECT, INSERT, UPDATE, DELETE
   - Target roles: `authenticated`
   - Policy definition: `(auth.uid() = owner)` — or just use the template "Give users access to own folder"

---

## Step 4 — Deploy to Vercel

1. Go to [https://vercel.com](https://vercel.com) and sign up with GitHub (free)
2. Push this project folder to a GitHub repository
3. In Vercel, click **Add New Project** and import your GitHub repo
4. Before deploying, add these **Environment Variables** in Vercel:
   ```
   VITE_SUPABASE_URL        = https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY   = eyJ...your anon key...
   ```
5. Click **Deploy** — it will be live in ~1 minute
6. Your app URL will be something like `https://tenant-pm.vercel.app`

---

## Step 5 — Add a Custom Domain (Optional)

1. In Vercel, go to your project → **Settings → Domains**
2. Add your domain (e.g., `tenantpm.yourdomain.com`)
3. Follow Vercel's DNS instructions for your domain provider

---

## Local Development

```bash
# Install dependencies
npm install

# Copy environment file and fill in your Supabase credentials
cp .env.example .env.local

# Start the dev server
npm run dev
```

---

## Adding More Users (Your Staff / Co-managers)

Each person creates their own account at your app URL. Their data is fully
separate — they only see the tenants they create. If you want shared access
(e.g., you and a co-manager see the same tenants), that requires an additional
"organizations" feature — ask your developer to add it.

---

## Subscription Billing (Optional — Charge Other Landlords)

If you want to sell this to other landlords, add Stripe:
1. Create a [Stripe](https://stripe.com) account
2. Install `@stripe/stripe-js` and create a pricing page
3. Use Stripe webhooks to gate access in Supabase via a `subscriptions` table
Ask your developer to implement this — it's a standard 1–2 day add-on.

---

## Files in This Project

```
TenantPM-SaaS/
├── README.md                  ← You are here
├── package.json               ← Dependencies
├── vite.config.js             ← Build config
├── index.html                 ← HTML entry point
├── .env.example               ← Environment variable template
├── supabase/
│   └── schema.sql             ← Database tables + security rules
└── src/
    ├── main.jsx               ← App entry point
    ├── lib/
    │   ├── supabase.js        ← Database client
    │   └── excel.js           ← Excel export logic
    ├── components/
    │   └── Auth.jsx           ← Login / Sign-up screen
    └── App.jsx                ← Main application
```

---

## Support

If you get stuck, share this README and the `supabase/schema.sql` file with
any developer on Upwork or Fiverr — they can have it running in 1–2 hours.
Search for "Supabase + React developer."
