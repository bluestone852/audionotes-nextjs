import { IncomingForm } from 'formidable';
import fs from 'fs';
import fetch from 'node-fetch';

// Disable the default body parser
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse form data (with file)
    const form = new IncomingForm({
      keepExtensions: true,
    });

    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) return reject(err);
        resolve([fields, files]);
      });
    });

    const audioFile = files.file;
    const filePath = audioFile.filepath;

    // Read the file
    const fileBuffer = fs.readFileSync(filePath);

    // Call OpenAI API for transcription
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    const transcriptionResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: (() => {
        const formData = new FormData();
        formData.append('file', new Blob([fileBuffer]), 'audio.wav');
        formData.append('model', 'whisper-1');
        return formData;
      })(),
    });

    if (!transcriptionResponse.ok) {
      throw new Error(`Transcription API error: ${transcriptionResponse.statusText}`);
    }

    const transcriptionData = await transcriptionResponse.json();

    // Clean up temp file
    fs.unlinkSync(filePath);

    // Return the transcription
    return res.status(200).json({ text: transcriptionData.text });
  } catch (error) {
    console.error('Error in transcribe API:', error);
    return res.status(500).json({ error: 'Failed to transcribe audio' });
  }
}