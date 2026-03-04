#!/bin/bash
#
# Quick setup script to create a test user and API key
#
# Usage: ./scripts/setup_user.sh

API_URL="${API_URL:-http://localhost:8001}"
EMAIL="${EMAIL:-test@example.com}"
PASSWORD="${PASSWORD:-testpassword123}"

echo "🔧 Setting up CrewAI Monitor test user..."
echo "   API URL: $API_URL"
echo "   Email: $EMAIL"
echo ""

# Register user
echo "📝 Registering user..."
REGISTER_RESPONSE=$(curl -s -X POST "$API_URL/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\", \"password\": \"$PASSWORD\", \"name\": \"Test User\"}")

TOKEN=$(echo $REGISTER_RESPONSE | python3 -c "import sys, json; print(json.load(sys.stdin).get('access_token', ''))" 2>/dev/null)

if [ -z "$TOKEN" ]; then
  echo "   User may already exist, trying to login..."
  LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/v1/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\": \"$EMAIL\", \"password\": \"$PASSWORD\"}")
  TOKEN=$(echo $LOGIN_RESPONSE | python3 -c "import sys, json; print(json.load(sys.stdin).get('access_token', ''))" 2>/dev/null)
fi

if [ -z "$TOKEN" ]; then
  echo "❌ Failed to get token. Response:"
  echo "$REGISTER_RESPONSE"
  exit 1
fi

echo "✅ Got JWT token"

# Create API key
echo ""
echo "🔑 Creating API key..."
KEY_RESPONSE=$(curl -s -X POST "$API_URL/v1/auth/keys" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Key", "environment": "live"}')

API_KEY=$(echo $KEY_RESPONSE | python3 -c "import sys, json; print(json.load(sys.stdin).get('key', ''))" 2>/dev/null)

if [ -z "$API_KEY" ]; then
  echo "❌ Failed to create API key. Response:"
  echo "$KEY_RESPONSE"
  exit 1
fi

echo "✅ Created API key"

# Create default alert rules
echo ""
echo "🔔 Creating default alert rules..."
curl -s -X POST "$API_URL/v1/alerts/rules/create-defaults" \
  -H "Authorization: Bearer $TOKEN" > /dev/null

echo "✅ Created default alert rules"

# Output
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "✅ Setup complete!"
echo ""
echo "Your API Key (save this - it's only shown once!):"
echo "   $API_KEY"
echo ""
echo "Export it to use with the SDK:"
echo "   export API_KEY=\"$API_KEY\""
echo ""
echo "Your JWT Token (for dashboard API calls):"
echo "   export TOKEN=\"$TOKEN\""
echo ""
echo "Next steps:"
echo "   1. export API_KEY=\"$API_KEY\""
echo "   2. python scripts/test_sdk.py"
echo "   3. Open http://localhost:3002 and login with:"
echo "      Email: $EMAIL"
echo "      Password: $PASSWORD"
echo "═══════════════════════════════════════════════════════════════"
