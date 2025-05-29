// MVola API Wrapper pour Deno Deploy
// Version: 1.0

// Configuration MVola Sandbox
const MVOLA_CONFIG = {
  BASE_URL: "https://devapi.mvola.mg",
  TOKEN_ENDPOINT: "/token",
  MERCHANT_PAY_ENDPOINT: "/mvola/mm/transactions/type/merchantpay/1.0.0/",
  // TODO: Ajouter tes vraies clés via variables d'environnement
  CONSUMER_KEY: Deno.env.get("MVOLA_CONSUMER_KEY") || "",
  CONSUMER_SECRET: Deno.env.get("MVOLA_CONSUMER_SECRET") || "",
};

// Interface pour les réponses MVola
interface MvolaAuthResponse {
  access_token: string;
  scope: string;
  token_type: string;
  expires_in: number;
}

interface MvolaPaymentRequest {
  amount: string;
  currency: string;
  descriptionText: string;
  debitParty: { key: string; value: string }[];
  creditParty: { key: string; value: string }[];
  metadata: { key: string; value: string }[];
  requestDate?: string;
  requestingOrganisationTransactionReference?: string;
  originalTransactionReference?: string;
}

// Fonction d'authentification MVola
async function authenticateMvola(): Promise<MvolaAuthResponse | null> {
  try {
    const credentials = btoa(`${MVOLA_CONFIG.CONSUMER_KEY}:${MVOLA_CONFIG.CONSUMER_SECRET}`);
    
    const response = await fetch(`${MVOLA_CONFIG.BASE_URL}${MVOLA_CONFIG.TOKEN_ENDPOINT}`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Cache-Control": "no-cache",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        scope: "EXT_INT_MVOLA_SCOPE",
      }),
    });

    if (!response.ok) {
      console.error("Auth failed:", response.status, await response.text());
      return null;
    }

    return await response.json() as MvolaAuthResponse;
  } catch (error) {
    console.error("Auth error:", error);
    return null;
  }
}

// Fonction d'initiation de paiement
async function initiateMvolaPayment(paymentData: MvolaPaymentRequest, accessToken: string) {
  try {
    const headers = {
      "Authorization": `Bearer ${accessToken}`,
      "Version": "1.0",
      "X-CorrelationID": crypto.randomUUID(),
      "UserLanguage": "mg",
      "UserAccountIdentifier": `msisdn;${paymentData.debitParty[0].value}`,
      "partnerName": "Test Partner",
      "Content-Type": "application/json",
      "X-Callback-URL": "",
      "Cache-Control": "no-cache",
    };

    // Debug logs
    console.log("=== MVola Payment Request ===");
    console.log("URL:", `${MVOLA_CONFIG.BASE_URL}${MVOLA_CONFIG.MERCHANT_PAY_ENDPOINT}`);
    console.log("Headers:", JSON.stringify(headers, null, 2));
    console.log("Body:", JSON.stringify(paymentData, null, 2));

    const response = await fetch(`${MVOLA_CONFIG.BASE_URL}${MVOLA_CONFIG.MERCHANT_PAY_ENDPOINT}`, {
      method: "POST",
      headers,
      body: JSON.stringify(paymentData),
    });

    const result = await response.json();
    
    console.log("=== MVola Response ===");
    console.log("Status:", response.status);
    console.log("Response:", JSON.stringify(result, null, 2));

    return { status: response.status, data: result };
  } catch (error) {
    console.error("Payment initiation error:", error);
    return { status: 500, data: { error: error.message } };
  }
}

// Handler principal
export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const { pathname, searchParams } = url;

    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    // Handle preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      switch (pathname) {
        case "/":
          return new Response("🚀 MVola API Wrapper is running!\n\nEndpoints:\n- GET /test\n- POST /auth\n- POST /payment\n- GET /status\n- POST /webhook", {
            headers: { ...corsHeaders, "Content-Type": "text/plain" }
          });

        case "/test":
          return new Response(JSON.stringify({
            message: "✅ API is working!",
            timestamp: new Date().toISOString(),
            config: {
              baseUrl: MVOLA_CONFIG.BASE_URL,
              hasCredentials: !!(MVOLA_CONFIG.CONSUMER_KEY && MVOLA_CONFIG.CONSUMER_SECRET)
            }
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });

        case "/auth":
          if (request.method !== "POST") {
            return new Response("Method not allowed", { status: 405, headers: corsHeaders });
          }
          
          const authResult = await authenticateMvola();
          if (!authResult) {
            return new Response(JSON.stringify({ error: "Authentication failed" }), {
              status: 401,
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }
          
          return new Response(JSON.stringify({
            success: true,
            token: authResult.access_token,
            expires_in: authResult.expires_in
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });

        case "/payment":
          if (request.method !== "POST") {
            return new Response("Method not allowed", { status: 405, headers: corsHeaders });
          }

          // Authentification d'abord
          const auth = await authenticateMvola();
          if (!auth) {
            return new Response(JSON.stringify({ error: "Authentication failed" }), {
              status: 401,
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }

          // Parse le body de la requête
          const paymentRequest = await request.json() as MvolaPaymentRequest;
          
          // Forcer les valeurs exactes de la documentation MVola
          paymentRequest.requestDate = "";
          paymentRequest.requestingOrganisationTransactionReference = "";
          paymentRequest.originalTransactionReference = "";

          const paymentResult = await initiateMvolaPayment(paymentRequest, auth.access_token);
          
          return new Response(JSON.stringify(paymentResult), {
            status: paymentResult.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });

        case "/webhook":
          if (request.method !== "POST") {
            return new Response("Method not allowed", { status: 405, headers: corsHeaders });
          }

          const webhookData = await request.json();
          console.log("Webhook received:", webhookData);
          
          // TODO: Traiter le webhook (notifier Odoo, update DB, etc.)
          
          return new Response(JSON.stringify({ received: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });

        default:
          return new Response("Not Found", { 
            status: 404, 
            headers: corsHeaders 
          });
      }
    } catch (error) {
      console.error("Handler error:", error);
      return new Response(JSON.stringify({ 
        error: "Internal server error",
        message: error.message 
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }
};
