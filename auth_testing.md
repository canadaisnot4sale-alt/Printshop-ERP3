# Auth Testing — Print and Save ERP

Admin: admin@printandsave.ca / admin123 (seeded on startup)
Token returned in login response; frontend stores in localStorage `pns_token` and sends `Authorization: Bearer`. Cookie also set.

## API
curl -X POST $URL/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@printandsave.ca","password":"admin123"}'
curl $URL/api/auth/me -H "Authorization: Bearer <token>"
