"use client";

import { useCallback, useState } from "react";
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
import { CreditCard, Loader2, Shield } from "lucide-react";
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

interface StripeCardSaveFormProps {
  onSuccess: (paymentMethodId: string) => void;
  onCancel: () => void;
}

function CardSaveFormInner({ onSuccess, onCancel }: StripeCardSaveFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);

  const handleSave = useCallback(async () => {
    if (!stripe || !elements) {
      toast.error("Stripe not loaded. Please refresh the page.");
      return;
    }

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      toast.error("Please enter your card details.");
      return;
    }

    setProcessing(true);

    try {
      // 1. Create a SetupIntent on the server
      const siRes = await fetch("/api/community/payment-methods/stripe", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setup_intent" }),
      });
      const siData = await siRes.json();
      if (!siRes.ok || !siData.clientSecret) {
        throw new Error(siData?.error || "Failed to create setup intent");
      }

      // 2. Confirm the card setup with Stripe.js using the CardElement
      const { error: confirmError, setupIntent } = await stripe.confirmCardSetup(
        siData.clientSecret,
        {
          payment_method: {
            card: cardElement,
          },
        }
      );

      if (confirmError) {
        throw new Error(confirmError.message || "Card verification failed");
      }

      // 3. Get the PaymentMethod ID from the SetupIntent
      const pmId = setupIntent?.payment_method as string;

      // 4. Save the PaymentMethod to our DB
      const saveRes = await fetch("/api/community/payment-methods/stripe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethodId: pmId }),
      });
      const saveData = await saveRes.json();

      if (!saveRes.ok || !saveData.paymentMethod) {
        throw new Error(saveData?.error || "Failed to save card");
      }

      toast.success("Card added successfully!");
      onSuccess(pmId);
    } catch (error: any) {
      toast.error(error?.message || "Failed to add card");
    } finally {
      setProcessing(false);
    }
  }, [stripe, elements, onSuccess]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/[0.1] bg-white/[0.03] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-white">Enter Card Details</p>
          <button
            onClick={onCancel}
            className="text-[11px] text-white/40 hover:text-white"
          >
            Cancel
          </button>
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
        <div className="rounded-lg bg-blue-500/10 border border-blue-500/15 p-3 flex items-start gap-2">
          <Shield className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
          <p className="text-[11px] text-white/50">Your card details are securely processed by Stripe and never stored on our servers.</p>
        </div>
      </div>
      <button
        onClick={handleSave}
        disabled={processing || !stripe}
        className="w-full h-11 rounded-xl bg-white text-black text-sm font-bold hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
      >
        {processing ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" /> Saving...
          </>
        ) : (
          <>
            <CreditCard className="w-4 h-4" /> Save Card
          </>
        )}
      </button>
    </div>
  );
}

export default function StripeCardSaveForm(props: StripeCardSaveFormProps) {
  return (
    <Elements stripe={stripePromise} options={cardElementOptions}>
      <CardSaveFormInner {...props} />
    </Elements>
  );
}
