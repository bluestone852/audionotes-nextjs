import { useState, useRef, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import Head from 'next/head';
import styles from '../styles/Home.module.css';

// Initialize Supabase client with environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default function Home() {
  const [recording, setRecording] = useState(false);
  const [audioURL, setAudioURL] = useState('');
  const [transcription, setTranscription] = useState('');
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  
  // Fetch existing notes on component mount
  useEffect(() => {
    fetchNotes();
  }, []);
  
  const fetchNotes = async () => {
    try {
      const { data, error } = await supabase
        .from('audio_notes')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setNotes(data || []);
    } catch (err) {
      console.error('Error fetching notes:', err);
      setError('Failed to load notes');
    }
  };
  
  const startRecording = async () => {
    try {
      audioChunksRef.current = [];
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const url = URL.createObjectURL(audioBlob);
        setAudioURL(url);
        
        // Transcribe the audio
        transcribeAudio(audioBlob);
      };
      
      mediaRecorderRef.current.start();
      setRecording(true);
    } catch (err) {
      console.error('Error starting recording:', err);
      setError('Permission to access microphone was denied');
    }
  };
  
  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      
      // Stop all audio tracks
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };
  
  const transcribeAudio = async (audioBlob) => {
    setLoading(true);
    try {
      // Create a FormData object to send the audio file
      const formData = new FormData();
      formData.append('file', audioBlob, 'recording.wav');
      
      // Use a transcription service API (like OpenAI Whisper)
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error('Transcription failed');
      }
      
      const data = await response.json();
      setTranscription(data.text);
    } catch (err) {
      console.error('Error transcribing audio:', err);
      setError('Failed to transcribe audio');
    } finally {
      setLoading(false);
    }
  };
  
  const saveNote = async () => {
    if (!audioURL || !transcription) {
      setError('Nothing to save');
      return;
    }
    
    setLoading(true);
    try {
      // Convert the Blob URL to an actual Blob for upload
      const response = await fetch(audioURL);
      const audioBlob = await response.blob();
      
      // Upload audio file to Supabase Storage
      const fileName = `recording-${Date.now()}.wav`;
      const { data: fileData, error: fileError } = await supabase.storage
        .from('audio_recordings')
        .upload(fileName, audioBlob, {
          contentType: 'audio/wav',
        });
      
      if (fileError) throw fileError;
      
      // Get the public URL for the uploaded file
      const { data: publicUrl } = supabase.storage
        .from('audio_recordings')
        .getPublicUrl(fileName);
      
      // Save record to the database
      const { data, error } = await supabase
        .from('audio_notes')
        .insert([
          {
            audio_url: publicUrl.publicUrl,
            transcription: transcription,
            created_at: new Date().toISOString(),
          },
        ]);
      
      if (error) throw error;
      
      // Clear current recording
      setAudioURL('');
      setTranscription('');
      
      // Refresh notes list
      fetchNotes();
    } catch (err) {
      console.error('Error saving note:', err);
      setError('Failed to save note');
    } finally {
      setLoading(false);
    }
  };
  
  const deleteNote = async (id) => {
    if (!confirm('Are you sure you want to delete this note?')) return;
    
    try {
      // Get the note to find the file path
      const { data: noteData } = await supabase
        .from('audio_notes')
        .select('audio_url')
        .eq('id', id)
        .single();
      
      if (noteData) {
        // Extract filename from the URL
        const fileName = noteData.audio_url.split('/').pop();
        
        // Delete from storage
        await supabase.storage
          .from('audio_recordings')
          .remove([fileName]);
      }
      
      // Delete from database
      const { error } = await supabase
        .from('audio_notes')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      
      // Refresh notes list
      fetchNotes();
    } catch (err) {
      console.error('Error deleting note:', err);
      setError('Failed to delete note');
    }
  };
  
  return (
    <div className={styles.container}>
      <Head>
        <title>Audio Notes App</title>
        <meta name="description" content="Record, transcribe and save audio notes" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      
      <main className={styles.main}>
        <h1 className={styles.title}>Audio Notes</h1>
        
        <div className={styles.recorderSection}>
          <div className={styles.controls}>
            {!recording ? (
              <button 
                className={styles.recordButton} 
                onClick={startRecording}
                disabled={loading}
              >
                Start Recording
              </button>
            ) : (
              <button 
                className={styles.stopButton} 
                onClick={stopRecording}
              >
                Stop Recording
              </button>
            )}
          </div>
          
          {audioURL && (
            <div className={styles.audioPreview}>
              <audio src={audioURL} controls className={styles.audioPlayer} />
            </div>
          )}
          
          {loading && <p className={styles.loading}>Processing...</p>}
          
          {transcription && (
            <div className={styles.transcriptionBox}>
              <h3>Transcription:</h3>
              <p>{transcription}</p>
              <button 
                className={styles.saveButton}
                onClick={saveNote}
                disabled={loading}
              >
                Save Note
              </button>
            </div>
          )}
          
          {error && <p className={styles.error}>{error}</p>}
        </div>
        
        <div className={styles.notesSection}>
          <h2>Saved Notes</h2>
          {notes.length === 0 ? (
            <p className={styles.emptyState}>No notes yet. Record your first note!</p>
          ) : (
            <div className={styles.notesList}>
              {notes.map((note) => (
                <div key={note.id} className={styles.noteItem}>
                  <div className={styles.noteContent}>
                    <p className={styles.noteDate}>
                      {new Date(note.created_at).toLocaleString()}
                    </p>
                    <p className={styles.noteText}>{note.transcription}</p>
                    <audio src={note.audio_url} controls className={styles.audioPlayer} />
                  </div>
                  <button 
                    className={styles.deleteButton}
                    onClick={() => deleteNote(note.id)}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}