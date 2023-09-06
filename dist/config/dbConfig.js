"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
// Define the PostgreSQL connection string with SSL/TLS enabled
const connectionString = 'postgres://postgresql_bitespeed_user:ugPqz03G61zp77rkvFNclBhfvzSJWuGa@dpg-cjrcns61208c73bjbs2g-a.oregon-postgres.render.com/postgresql_bitespeed?sslmode=require';
// Create a PostgreSQL connection pool using the connection string
const pool = new pg_1.Pool({
    connectionString: connectionString,
});
exports.default = pool;
