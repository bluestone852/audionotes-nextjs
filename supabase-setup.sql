-- Run these commands in your Supabase SQL Editor

-- Create audio_notes table
create table if not exists audio_notes (
  id uuid default uuid_generate_v4() primary key,
  audio_url text not null,
  transcription text not null,
  created_at timestamp with time zone default now() not null
);

-- Set up storage policies
-- Allow public access to read files
create policy "Public Access"
  on storage.objects for select
  using ( bucket_id = 'audio_recordings' );

-- Allow authenticated users to upload files
create policy "Authenticated users can upload"
  on storage.objects for insert
  to authenticated
  with check ( bucket_id = 'audio_recordings' );

-- Allow authenticated users to update their own files
create policy "Authenticated users can update their own files"
  on storage.objects for update
  to authenticated
  using ( bucket_id = 'audio_recordings' );

-- Allow authenticated users to delete their own files
create policy "Authenticated users can delete their own files"
  on storage.objects for delete
  to authenticated
  using ( bucket_id = 'audio_recordings' );