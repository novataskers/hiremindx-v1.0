"use client";

import { useState, useCallback } from "react";
import {
  loadStripe,
  Stripe,
  StripeElementsOptions,
} from "@stripe/stripe-js";
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { CreditCard, Check, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ""
);

const cardElementOptions: StripeElementsOptions = {
  appearance: {
    theme: "night",
    variables: {
      colorPrimary: "#10b981",
      colorBackground: "#0f0f0f",
      colorText: "#ffffff",
      colorDanger: "#ef4444",
      borderRadius: "12px",
      fontSizeBase: "14px",
      spacingUnit: "4px",
    },
  },
};

interface SavedMethod {
  id: number;
  label: string;
  last4?: string | null;
  cardBrand?: string | null;
  accountId?: string | null;
}

interface StripePaymentFormProps {
  savedMethods: SavedMethod[];
  onPaymentMethodSelect: (id: number | null) => void;
  selectedPaymentMethod: number | null;
  amount: number;
  contractId: string;
  freelancerId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

function PaymentFormInner({
  savedMethods,
  onPaymentMethodSelect,
  selectedPaymentMethod,
  amount,
  contractId,
  freelancerId,
  onSuccess,
  onCancel,
}: StripePaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [addingNew, setAddingNew] = useState(savedMethods.length === 0);
  const [processing, setProcessing] = useState(false);

  const handlePay = useCallback(async () => {
    if (!stripe) {
      toast.error("Stripe not loaded. Please refresh the page.");
      return;
    }

    setProcessing(true);
    let paymentMethodId: string | undefined;

    try {
      if (addingNew) {
        // Create new PaymentMethod from CardElement
        if (!elements) {
          toast.error("Payment form not ready.");
          setProcessing(false);
          return;
        }
        const cardElement = elements.getElement(CardElement);
        if (!cardElement) {
          toast.error("Please enter your card details.");
          setProcessing(false);
          return;
        }

        const { error, paymentMethod } = await stripe.createPaymentMethod({
          type: "card",
          card: cardElement,
        });

        if (error) {
          toast.error(error.message || "Failed to validate card");
          setProcessing(false);
          return;
        }

        if (!paymentMethod) {
          toast.error("Could not create payment method.");
          setProcessing(false);
          return;
        }

        paymentMethodId = paymentMethod.id;

        // Save to our DB for future use
        const saveRes = await fetch("/api/community/payment-methods/stripe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentMethodId: paymentMethod.id }),
        });

        if (!saveRes.ok) {
          console.warn("Failed to save payment method to DB, continuing anyway");
        }
      } else {
        // Use saved PaymentMethod
        const selected = savedMethods.find(
          (m) => m.id === selectedPaymentMethod
        );
        if (!selected) {
          toast.error("Please select a payment method.");
          setProcessing(false);
          return;
        }
        paymentMethodId = selected.accountId || undefined;
        if (!paymentMethodId) {
          toast.error("Invalid saved payment method.");
          setProcessing(false);
          return;
        }
      }

      // Call escrow API to fund
      const escrowRes = await fetch("/api/community/escrow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "fund",
          contractId,
          freelancerId,
          contractAmount: amount,
          paymentMethodId,
        }),
      });

      const escrowData = await escrowRes.json();

      if (!escrowRes.ok) {
        throw new Error(escrowData.error || "Failed to fund escrow");
      }

      // If PaymentIntent requires confirmation (e.g., 3D Secure)
      if (escrowData.requiresAction && escrowData.clientSecret) {
        const returnUrl = typeof window !== "undefined"
          ? `${window.location.origin}/community`
          : "https://www.hiremindx.com/community";
        const { error: confirmError } = await stripe.confirmCardPayment(
          escrowData.clientSecret,
          { return_url: returnUrl }
        );
        if (confirmError) {
          throw new Error(
            confirmError.message || "Payment authentication failed"
          );
        }

        // After 3D Secure, call backend again to record the escrow
        const confirmRes = await fetch("/api/community/escrow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "fund",
            contractId,
            freelancerId,
            contractAmount: amount,
            paymentIntentId: escrowData.paymentIntentId,
          }),
        });
        const confirmData = await confirmRes.json();
        if (!confirmRes.ok) {
          throw new Error(confirmData.error || "Failed to confirm escrow funding");
        }
      }

      toast.success("Escrow funded successfully!");
      onSuccess();
    } catch (error: any) {
      toast.error(error?.message || "Failed to process payment");
    } finally {
      setProcessing(false);
    }
  }, [
    stripe,
    elements,
    addingNew,
    savedMethods,
    selectedPaymentMethod,
    amount,
    contractId,
    freelancerId,
    onSuccess,
  ]);

  return (
    <div className="space-y-4">
      {/* Saved methods */}
      {!addingNew && savedMethods.length > 0 && (
        <div className="space-y-2">
          {savedMethods.map((pm) => (
            <button
              key={pm.id}
              onClick={() => onPaymentMethodSelect(pm.id)}
              className={`w-full flex items-center gap-3 p-3.5 rounded-xl border transition-all text-left ${
                selectedPaymentMethod === pm.id
                  ? "border-emerald-500/30 bg-emerald-500/10"
                  : "border-white/[0.08] bg-white/[0.03] hover:border-white/20"
              }`}
            >
              <CreditCard
                className={`w-4 h-4 ${
                  selectedPaymentMethod === pm.id
                    ? "text-emerald-400"
                    : "text-white/40"
                }`}
              />
              <span
                className={`text-sm ${
                  selectedPaymentMethod === pm.id
                    ? "text-white font-semibold"
                    : "text-white/60"
                }`}
              >
                {pm.label}
              </span>
              {selectedPaymentMethod === pm.id && (
                <Check className="w-4 h-4 text-emerald-400 ml-auto" />
              )}
            </button>
          ))}
          <button
            onClick={() => {
              setAddingNew(true);
              onPaymentMethodSelect(null);
            }}
            className="w-full flex items-center justify-center gap-2 h-11 rounded-xl border border-dashed border-white/[0.12] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04] transition-all text-xs font-semibold text-white/50"
          >
            <Plus className="w-3.5 h-3.5" /> Add New Card
          </button>
        </div>
      )}

      {/* New card form */}
      {addingNew && (
        <div className="rounded-2xl border border-white/[0.1] bg-white/[0.03] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-white">Add New Card</p>
            {savedMethods.length > 0 && (
              <button
                onClick={() => {
                  setAddingNew(false);
                  onPaymentMethodSelect(
                    savedMethods[0]?.id ?? null
                  );
                }}
                className="text-[11px] text-white/40 hover:text-white"
              >
                Use saved card
              </button>
            )}
          </div>
          <div className="p-4 rounded-xl bg-white/[0.05] border border-white/[0.08]">
            <CardElement
              options={{
                style: {
                  base: {
                    fontSize: "14px",
                    color: "#ffffff",
                    "::placeholder": { color: "#6b7280" },
                  },
                  invalid: { color: "#ef4444" },
                },
              }}
            />
          </div>
        </div>
      )}

      {/* Pay button */}
      <button
        onClick={handlePay}
        disabled={
          processing || (!addingNew && !selectedPaymentMethod && savedMethods.length > 0)
        }
        className="w-full h-13 py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 text-white font-bold text-sm hover:from-emerald-500 hover:to-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
      >
        {processing ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" /> Processing...
          </>
        ) : (
          <>
            <CreditCard className="w-4 h-4" /> Pay £
            {(amount * 1.1).toFixed(2)} & Fund Escrow
          </>
        )}
      </button>
    </div>
  );
}

export default function StripeEscrowPaymentForm(props: StripePaymentFormProps) {
  return (
    <Elements stripe={stripePromise} options={cardElementOptions}>
      <PaymentFormInner {...props} />
    </Elements>
  );
}
