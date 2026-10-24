import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';

export type AgreementEvidenceType = 'vehicle_photo' | 'signed_agreement';

export interface AgreementEvidence {
  id: string;
  assignment_id: string;
  evidence_type: AgreementEvidenceType;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: string;
}

@Injectable({ providedIn: 'root' })
export class AgreementEvidenceService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly allowedTypes = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf'
  ]);

  async fetchAll(): Promise<AgreementEvidence[]> {
    const { data, error } = await this.supabase
      .from('agreement_evidence')
      .select('id, assignment_id, evidence_type, storage_path, original_filename, mime_type, size_bytes, uploaded_at')
      .order('uploaded_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  async createSignedUrl(storagePath: string): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from('agreement-evidence')
      .createSignedUrl(storagePath, 3600);
    if (error) throw error;
    return data.signedUrl;
  }

  async upload(assignmentId: string, evidenceType: AgreementEvidenceType, file: File): Promise<void> {
    if (!this.allowedTypes.has(file.type)) {
      throw new Error('Choose a JPG, PNG, WebP, or PDF file.');
    }
    if (file.size === 0 || file.size > 10 * 1024 * 1024) {
      throw new Error('Each evidence file must be smaller than 10 MB.');
    }

    const { data: { user }, error: userError } = await this.supabase.auth.getUser();
    if (userError) throw userError;
    if (!user) throw new Error('Sign in again before uploading agreement evidence.');

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100) || 'evidence';
    const storagePath = `${user.id}/${assignmentId}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await this.supabase.storage
      .from('agreement-evidence')
      .upload(storagePath, file, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;

    const { error: metadataError } = await this.supabase.from('agreement_evidence').insert({
      assignment_id: assignmentId,
      evidence_type: evidenceType,
      storage_path: storagePath,
      original_filename: file.name,
      mime_type: file.type,
      size_bytes: file.size
    });

    if (metadataError) {
      await this.supabase.storage.from('agreement-evidence').remove([storagePath]);
      throw metadataError;
    }
  }
}