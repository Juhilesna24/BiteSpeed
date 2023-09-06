import { Pool } from 'pg';

// Define the PostgreSQL connection string with SSL/TLS enabled
const connectionString = 'postgres://postgresql_bitespeed_user:ugPqz03G61zp77rkvFNclBhfvzSJWuGa@dpg-cjrcns61208c73bjbs2g-a.oregon-postgres.render.com/postgresql_bitespeed?sslmode=require';

// Create a PostgreSQL connection pool using the connection string
const pool = new Pool({
  connectionString: connectionString,
});

export default pool;
