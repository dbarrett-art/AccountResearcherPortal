import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  'https://yeraphdhllaylogqiqht.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InllcmFwaGRobGxheWxvZ3FpcWh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MDY4NjQsImV4cCI6MjA5MDA4Mjg2NH0.5ZIIIoYU3-4ZoGX448LMyuKfu4ncmIUVwyNDImEsVTY'
);
