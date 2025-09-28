import admin from 'firebase-admin';
import fs from 'node:fs';
import path from 'node:path';

class FirebaseService {
  public readonly admin: typeof admin;

  constructor() {
    // Initialize Admin SDK similarly to previous firebase.ts
    const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 'secrets/firebase.json';
    let credential: admin.credential.Credential | null = null;
    if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
      const abs = path.resolve(serviceAccountPath);
      const obj = JSON.parse(fs.readFileSync(abs, 'utf-8'));
      credential = admin.credential.cert(obj as admin.ServiceAccount);
    }

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: credential ?? admin.credential.applicationDefault(),
      });
    }
    this.admin = admin;
  }

  async verifyIdToken(token: string) {
    return this.admin.auth().verifyIdToken(token);
  }
}

export const firebaseService = new FirebaseService();


