import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://xzvlgmqzzruxbcdwgfrq.supabase.co'; // Reemplázalo con tu URL
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6dmxnbXF6enJ1eGJjZHdnZnJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDMxMDAwOTEsImV4cCI6MjA1ODY3NjA5MX0.y6EXGI-SuVXUzld0gIQqgu7p0rxVCv-S6RIMQ7pI3Sc';
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log("Conectado a la base de datos");

