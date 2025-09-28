import { BaseAction } from './BaseAction.js';
import { firebaseService } from '../services/firebaseService.js';
import { DecodedIdToken } from 'firebase-admin/auth';

export type VerifyFirebaseTokenInput = { token: string };

export class VerifyFirebaseTokenAction extends BaseAction<VerifyFirebaseTokenInput, DecodedIdToken> {
  async execute({ token }: VerifyFirebaseTokenInput) {
    return firebaseService.verifyIdToken(token);
  }
}


