import express from 'express';
import JSZip from 'jszip';
import { db } from '../database.js';

const router = express.Router();

/**
 * GET /api/alliance-one/registrations
 * Retrieve all Shastra / Alliance One registrations
 */
router.get('/registrations', (req, res) => {
  try {
    const list = db.all('alliance_one_registrations') || [];
    // Sort newest first
    const sorted = [...list].sort((a, b) => new Date(b.created_at || b.timestamp) - new Date(a.created_at || a.timestamp));
    res.json(sorted);
  } catch (err) {
    console.error('Error fetching alliance one registrations:', err);
    res.status(500).json({ error: 'Failed to fetch registrations' });
  }
});

/**
 * GET /api/alliance-one/status
 * Get whether Alliance One portal submissions are locked or open
 */
router.get('/status', (req, res) => {
  try {
    let settings = db.get('alliance_one_settings', s => s.key === 'portal_lock');
    if (!settings) {
      settings = {
        key: 'portal_lock',
        is_locked: false,
        updated_at: new Date().toISOString()
      };
    }
    res.json({
      is_locked: !!settings.is_locked,
      locked_at: settings.locked_at || null,
      message: settings.is_locked ? 'Alliance ONE 2026 portal is locked.' : 'Alliance ONE 2026 portal is open.'
    });
  } catch (err) {
    console.error('Error fetching portal status:', err);
    res.status(500).json({ error: 'Failed to fetch status' });
  }
});

/**
 * POST /api/alliance-one/toggle-lock
 * Lock or unlock the Alliance One portal
 */
router.post('/toggle-lock', (req, res) => {
  try {
    const { is_locked } = req.body;
    let existing = db.get('alliance_one_settings', s => s.key === 'portal_lock');
    const newLockedState = (is_locked !== undefined) ? !!is_locked : !(existing && existing.is_locked);
    const now = new Date().toISOString();

    if (existing) {
      db.update('alliance_one_settings', s => s.key === 'portal_lock', {
        is_locked: newLockedState,
        locked_at: newLockedState ? now : null,
        updated_at: now
      });
    } else {
      db.insert('alliance_one_settings', {
        key: 'portal_lock',
        is_locked: newLockedState,
        locked_at: newLockedState ? now : null,
        updated_at: now
      });
    }

    console.log(`[Alliance One] Portal lock state updated to: ${newLockedState ? 'LOCKED' : 'UNLOCKED'}`);

    res.json({
      success: true,
      is_locked: newLockedState,
      message: newLockedState ? 'Alliance ONE Portal is now LOCKED' : 'Alliance ONE Portal is now UNLOCKED'
    });
  } catch (err) {
    console.error('Error toggling portal lock:', err);
    res.status(500).json({ error: 'Failed to toggle portal lock' });
  }
});

/**
 * POST /api/alliance-one/register
 * Register a team or individual for a Shastra event
 */
router.post('/register', (req, res) => {
  try {
    // Check if portal is locked
    const settings = db.get('alliance_one_settings', s => s.key === 'portal_lock');
    if (settings && settings.is_locked) {
      return res.status(403).json({ 
        error: 'Alliance ONE 2026 portal submissions are currently locked by the administrator.' 
      });
    }

    const data = req.body;
    if (!data.event_id && !data.event_name) {
      return res.status(400).json({ error: 'Event name is required' });
    }

    const timestamp = new Date().toISOString();
    const readableDate = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    const record = {
      ...data,
      timestamp: readableDate,
      created_at: timestamp
    };

    const saved = db.insert('alliance_one_registrations', record);
    console.log(`[Alliance One] New registration recorded: #${saved.id} - ${saved.team_name || saved.team_lead_name} (${saved.event_name})`);

    res.status(201).json({
      success: true,
      message: 'Registration submitted successfully!',
      registration: saved
    });
  } catch (err) {
    console.error('Error creating registration:', err);
    res.status(500).json({ error: 'Failed to save registration' });
  }
});

/**
 * DELETE /api/alliance-one/registrations/:id
 * Delete a registration by ID
 */
router.delete('/registrations/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const deleted = db.delete('alliance_one_registrations', r => r.id === id);
    if (!deleted) {
      return res.status(404).json({ error: 'Registration not found' });
    }
    res.json({ success: true, message: 'Registration deleted successfully' });
  } catch (err) {
    console.error('Error deleting registration:', err);
    res.status(500).json({ error: 'Failed to delete registration' });
  }
});

/**
 * Helper to determine clean event file slug
 */
function getEventSlug(filter) {
  if (!filter || filter.toUpperCase() === 'ALL') return 'All_Events';
  const f = filter.toUpperCase();
  if (f.includes('FREE FIRE')) return 'Free_Fire_Max';
  if (f.includes('BGMI')) return 'BGMI';
  if (f.includes('VALORANT')) return 'Valorant';
  if (f.includes('CLASH ROYALE')) return 'Clash_Royale';
  if (f.includes('EAFC') || f.includes('FIFA')) return 'EAFC25_FIFA';
  if (f.includes('CODESANGRAM')) return 'CodeSangram_3.0_Hackathon';
  if (f.includes('IPRAGYAN') || f.includes('FILM') || f.includes('PIXEL')) return 'iPragyan_Media_Art';
  return filter.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * GET /api/alliance-one/export
 * Download CSV of registrations, optionally filtered by event or game
 */
router.get('/export', (req, res) => {
  try {
    const list = db.all('alliance_one_registrations') || [];
    const filter = (req.query.filter || req.query.event || req.query.game || 'ALL').trim();
    const filterUpper = filter.toUpperCase();

    let filtered = [...list];
    if (filterUpper !== 'ALL') {
      filtered = filtered.filter(r => 
        (r.game_name && r.game_name.toUpperCase().includes(filterUpper)) ||
        (r.event_name && r.event_name.toUpperCase().includes(filterUpper)) ||
        (r.category && r.category.toUpperCase().includes(filterUpper))
      );
    }

    const sorted = filtered.sort((a, b) => new Date(b.created_at || b.timestamp) - new Date(a.created_at || a.timestamp));

    const headers = [
      'S.No',
      'Submission Timestamp',
      'Event Name',
      'Game / Category',
      'Competition Format',
      'Team / Participant Name',
      'Team Lead / Participant Full Name',
      'In-Game ID / Roll No',
      'Email Address',
      'Contact Phone',
      'College / Institution',
      'Teammate 2 Name',
      'Teammate 2 In-Game ID',
      'Teammate 2 Email',
      'Teammate 2 Phone',
      'Teammate 3 Name',
      'Teammate 3 In-Game ID',
      'Teammate 3 Email',
      'Teammate 3 Phone',
      'Teammate 4 Name',
      'Teammate 4 In-Game ID',
      'Teammate 4 Email',
      'Teammate 4 Phone',
      'Teammate 5 Name',
      'Teammate 5 In-Game ID',
      'Teammate 5 Email',
      'Teammate 5 Phone',
      'Bank Account Number',
      'Account Holder Name',
      'Bank Name',
      'IFSC Code',
      'Bank Branch',
      'Mobile Linked to Bank Account',
      'UPI ID',
      'Passbook Proof Attached',
      'Passbook Image URL',
      'Payment Proof Attached',
      'Payment Proof URL',
      'Bank Details Confirmation Status'
    ];

    const escapeCsv = (val) => {
      if (val === undefined || val === null) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = sorted.map((r, index) => {
      const isIndiv = r.is_individual || r.game_name?.includes('Clash Royale') || r.game_name?.includes('EAFC');
      const formatStr = isIndiv ? 'Solo (1v1)' : 'Squad Team';
      const hasPassbook = !!(r.passbook_preview || r.passbook_url);
      const hasPaymentProof = !!(r.payment_proof_preview || r.payment_proof_url);
      const hostUrl = req.protocol + '://' + req.get('host');
      const passbookLink = hasPassbook ? `${hostUrl}/api/alliance-one/passbook/${r.id}` : 'None';
      const paymentLink = hasPaymentProof ? `${hostUrl}/api/alliance-one/payment-proof/${r.id}` : 'None';
      
      // Format bank account with formula style so Excel does not convert to scientific notation
      const formattedAcc = r.bank_account_number ? `="${r.bank_account_number}"` : '""';

      return [
        escapeCsv(index + 1),
        escapeCsv(r.timestamp || r.created_at),
        escapeCsv(r.event_name),
        escapeCsv(r.game_name || r.category || '-'),
        escapeCsv(formatStr),
        escapeCsv(r.team_name || r.participant_name || '-'),
        escapeCsv(r.participant_name || r.team_lead_name || '-'),
        escapeCsv(r.team_lead_ingame_id || r.lead_ingame_id || '-'),
        escapeCsv(r.team_lead_email || r.email || '-'),
        escapeCsv(r.team_lead_phone || r.phone || '-'),
        escapeCsv(r.college || r.university || '-'),
        escapeCsv(r.teammate_2_name || '-'),
        escapeCsv(r.teammate_2_ingame_id || '-'),
        escapeCsv(r.teammate_2_email || '-'),
        escapeCsv(r.teammate_2_phone || '-'),
        escapeCsv(r.teammate_3_name || '-'),
        escapeCsv(r.teammate_3_ingame_id || '-'),
        escapeCsv(r.teammate_3_email || '-'),
        escapeCsv(r.teammate_3_phone || '-'),
        escapeCsv(r.teammate_4_name || '-'),
        escapeCsv(r.teammate_4_ingame_id || '-'),
        escapeCsv(r.teammate_4_email || '-'),
        escapeCsv(r.teammate_4_phone || '-'),
        escapeCsv(r.teammate_5_name || '-'),
        escapeCsv(r.teammate_5_ingame_id || '-'),
        escapeCsv(r.teammate_5_email || '-'),
        escapeCsv(r.teammate_5_phone || '-'),
        formattedAcc,
        escapeCsv(r.bank_account_holder_name || '-'),
        escapeCsv(r.bank_name || '-'),
        escapeCsv(r.bank_ifsc || '-'),
        escapeCsv(r.bank_branch || '-'),
        escapeCsv(r.bank_linked_mobile || '-'),
        escapeCsv(r.upi_id || '-'),
        escapeCsv(hasPassbook ? 'YES' : 'NO'),
        escapeCsv(passbookLink),
        escapeCsv(hasPaymentProof ? 'YES' : 'NO'),
        escapeCsv(paymentLink),
        escapeCsv(r.bank_details_confirmed ? 'Confirmed Verified' : 'Pending Verification')
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.map(escapeCsv).join(','), ...rows].join('\r\n');
    const slug = getEventSlug(filterUpper);
    const filename = `Alliance_ONE_2026_${slug}_Responses.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (err) {
    console.error('Error exporting CSV:', err);
    res.status(500).json({ error: 'Failed to generate export' });
  }
});

/**
 * GET /api/alliance-one/passbook/:id
 * Direct download/stream of a single candidate's bank passbook proof image
 */
router.get('/passbook/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const item = db.get('alliance_one_registrations', r => r.id === id);

    if (!item) {
      return res.status(404).send('Registration record not found');
    }

    const dataUrl = item.passbook_preview || item.passbook_url;
    if (!dataUrl) {
      return res.status(404).send('No passbook photo attached for this record');
    }

    // Check if data URL
    const match = dataUrl.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9\+\-\.]+);base64,(.+)$/);
    if (match) {
      const mimeType = match[1];
      const base64Data = match[2];
      const buffer = Buffer.from(base64Data, 'base64');

      let ext = 'png';
      if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg';
      else if (mimeType.includes('pdf')) ext = 'pdf';
      else if (mimeType.includes('webp')) ext = 'webp';

      const cleanName = (item.team_name || item.team_lead_name || item.participant_name || `Entry_${item.id}`).replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `${cleanName}_Bank_Passbook.${ext}`;

      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(buffer);
    }

    // If external URL redirect
    res.redirect(dataUrl);
  } catch (err) {
    console.error('Error serving passbook image:', err);
    res.status(500).send('Failed to serve passbook image');
  }
});

/**
 * GET /api/alliance-one/payment-proof/:id
 * Direct download/stream of a single candidate's payment screenshot or confirmation mail proof
 */
router.get('/payment-proof/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const item = db.get('alliance_one_registrations', r => r.id === id);

    if (!item) {
      return res.status(404).send('Registration record not found');
    }

    const dataUrl = item.payment_proof_preview || item.payment_proof_url;
    if (!dataUrl) {
      return res.status(404).send('No payment confirmation proof attached for this record');
    }

    // Check if data URL
    const match = dataUrl.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9\+\-\.]+);base64,(.+)$/);
    if (match) {
      const mimeType = match[1];
      const base64Data = match[2];
      const buffer = Buffer.from(base64Data, 'base64');

      let ext = 'png';
      if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg';
      else if (mimeType.includes('pdf')) ext = 'pdf';
      else if (mimeType.includes('webp')) ext = 'webp';

      const cleanName = (item.team_name || item.team_lead_name || item.participant_name || `Entry_${item.id}`).replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `${cleanName}_Payment_Confirmation.${ext}`;

      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(buffer);
    }

    // If external URL redirect
    res.redirect(dataUrl);
  } catch (err) {
    console.error('Error serving payment proof image:', err);
    res.status(500).send('Failed to serve payment proof image');
  }
});

/**
 * GET /api/alliance-one/export-passbooks
 * Download a ZIP archive containing all bank passbook photos and payment confirmation proofs
 */
router.get('/export-passbooks', async (req, res) => {
  try {
    const list = db.all('alliance_one_registrations') || [];
    const filter = (req.query.filter || req.query.event || req.query.game || 'ALL').trim();
    const filterUpper = filter.toUpperCase();

    let filtered = [...list];
    if (filterUpper !== 'ALL') {
      filtered = filtered.filter(r => 
        (r.game_name && r.game_name.toUpperCase().includes(filterUpper)) ||
        (r.event_name && r.event_name.toUpperCase().includes(filterUpper)) ||
        (r.category && r.category.toUpperCase().includes(filterUpper))
      );
    }

    // Filter to those with passbook proof or payment proof
    const withProof = filtered.filter(r => !!(r.passbook_preview || r.passbook_url || r.payment_proof_preview || r.payment_proof_url));

    if (withProof.length === 0) {
      return res.status(404).send('No uploaded passbook or payment photos found for this selection.');
    }

    const zip = new JSZip();
    const manifestRows = [
      'Index,Team/Participant,Event,Game,Account Number,Account Holder,IFSC Code,Passbook Filename,Payment Proof Filename'
    ];

    let count = 0;
    for (const r of withProof) {
      count++;
      const cleanTeam = (r.team_name || r.participant_name || r.team_lead_name || 'Team').replace(/[^a-zA-Z0-9_-]/g, '_');
      let passbookFilename = 'None';
      let paymentFilename = 'None';

      // 1. Process Bank Passbook
      const passbookUrl = r.passbook_preview || r.passbook_url;
      if (passbookUrl) {
        const match = passbookUrl.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9\+\-\.]+);base64,(.+)$/);
        if (match) {
          const mimeType = match[1];
          const base64Data = match[2];
          let ext = 'png';
          if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg';
          else if (mimeType.includes('pdf')) ext = 'pdf';
          else if (mimeType.includes('webp')) ext = 'webp';

          passbookFilename = `Passbooks/${String(count).padStart(2, '0')}_${cleanTeam}_Passbook.${ext}`;
          zip.file(passbookFilename, base64Data, { base64: true });
        }
      }

      // 2. Process Payment Confirmation Proof
      const paymentUrl = r.payment_proof_preview || r.payment_proof_url;
      if (paymentUrl) {
        const pMatch = paymentUrl.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9\+\-\.]+);base64,(.+)$/);
        if (pMatch) {
          const pMimeType = pMatch[1];
          const pBase64Data = pMatch[2];
          let pExt = 'png';
          if (pMimeType.includes('jpeg') || pMimeType.includes('jpg')) pExt = 'jpg';
          else if (pMimeType.includes('pdf')) pExt = 'pdf';
          else if (pMimeType.includes('webp')) pExt = 'webp';

          paymentFilename = `Payment_Proofs/${String(count).padStart(2, '0')}_${cleanTeam}_PaymentProof.${pExt}`;
          zip.file(paymentFilename, pBase64Data, { base64: true });
        }
      }

      manifestRows.push([
        count,
        `"${(r.team_name || r.participant_name || '-').replace(/"/g, '""')}"`,
        `"${(r.event_name || '-').replace(/"/g, '""')}"`,
        `"${(r.game_name || r.category || '-').replace(/"/g, '""')}"`,
        `="${r.bank_account_number || ''}"`,
        `"${(r.bank_account_holder_name || '-').replace(/"/g, '""')}"`,
        `"${(r.bank_ifsc || '-').replace(/"/g, '""')}"`,
        passbookFilename,
        paymentFilename
      ].join(','));
    }

    // Add Index and Summary
    zip.file('DOCUMENT_VERIFICATION_INDEX.csv', '\uFEFF' + manifestRows.join('\r\n'));
    zip.file('README_VERIFICATION.txt', 
`ALLIANCE ONE 2026 - BANK PASSBOOK & PAYMENT CONFIRMATION BUNDLE
Alliance School of Advanced Computing
Official Event Dates: 29, 30, 31 OCTOBER, 2026

Filter Selection: ${filterUpper}
Total Attached Verification Records: ${count}
Export Timestamp: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}

Includes both student bank passbooks for prize disbursal and payment screenshot/mail proofs for record verification.`
    );

    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });

    const slug = getEventSlug(filterUpper);
    const zipName = `Alliance_ONE_2026_${slug}_Verification_Documents.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);
    res.send(zipBuffer);
  } catch (err) {
    console.error('Error generating passbooks zip:', err);
    res.status(500).send('Failed to package passbook archive');
  }
});

export default router;
