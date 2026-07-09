import { useEffect, useState } from "react";
import { Snowflake, Sun } from "lucide-react";
import Protected from "../components/Protected";
import Layout from "../components/Layout";
import api, { errorMessage } from "../services/api";
import { useAuth } from "../hooks/useAuth";

interface Card {
  id: number;
  maskedNumber: string;
  expiry: string;
  isFrozen: boolean;
  account: { accountNumber: string; type: string };
}

export default function Cards() {
  const { user } = useAuth();
  const [cards, setCards] = useState<Card[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/cards").then((res) => setCards(res.data.cards));
  }, []);

  async function toggleFreeze(card: Card) {
    setError("");
    setBusy(true);
    try {
      const action = card.isFrozen ? "unfreeze" : "freeze";
      const res = await api.post(`/cards/${card.id}/${action}`);
      // just update the one card that changed
      setCards((all) =>
        all.map((c) => (c.id === card.id ? { ...c, isFrozen: res.data.card.isFrozen } : c))
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Protected>
      <Layout>
        <h1 className="font-display text-2xl font-bold">Your cards</h1>
        <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
          Freeze a card instantly if it's lost - unfreeze it just as fast when it turns up.
        </p>

        {error && (
          <p className="mt-4 max-w-md rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-8">
          {cards.map((card) => (
            <div key={card.id} className="w-full max-w-sm">
              {/* the card itself - greyscale + "FROZEN" stamp when frozen */}
              <div
                className={`relative aspect-[1.586] overflow-hidden rounded-2xl p-6 text-white shadow-card transition ${
                  card.isFrozen ? "grayscale" : ""
                } bg-gradient-to-br from-ink-900 via-brand-950 to-brand-700`}
              >
                {/* decorative circles like contactless waves */}
                <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full border border-white/10" />
                <div className="absolute -right-8 -top-8 h-48 w-48 rounded-full border border-white/10" />

                <div className="flex h-full flex-col justify-between">
                  <div className="flex items-start justify-between">
                    <p className="font-display font-bold">
                      Nova<span className="text-brand-300">Bank</span>
                    </p>
                    <p className="text-xs uppercase tracking-widest text-white/60">Debit</p>
                  </div>

                  <div>
                    <p className="font-display text-xl tracking-[0.18em]">{card.maskedNumber}</p>
                    <div className="mt-3 flex items-end justify-between text-xs text-white/70">
                      <div>
                        <p className="text-[10px] uppercase text-white/40">Card holder</p>
                        <p>{user?.fullName}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-white/40">Expires</p>
                        <p>{card.expiry}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {card.isFrozen && (
                  <div className="absolute inset-0 flex items-center justify-center bg-ink-950/40 backdrop-blur-[2px]">
                    <p className="flex items-center gap-2 rounded-full bg-white/90 px-4 py-1.5 text-sm font-bold text-ink-900">
                      <Snowflake size={15} /> FROZEN
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-ink-500 dark:text-ink-400">
                  Linked to {card.account.type === "CURRENT" ? "current" : "savings"} account{" "}
                  {card.account.accountNumber}
                </p>
                <button
                  onClick={() => toggleFreeze(card)}
                  disabled={busy}
                  className={card.isFrozen ? "btn-primary" : "btn-ghost border border-ink-200 dark:border-ink-700"}
                >
                  {card.isFrozen ? (
                    <>
                      <Sun size={15} /> Unfreeze
                    </>
                  ) : (
                    <>
                      <Snowflake size={15} /> Freeze card
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </Layout>
    </Protected>
  );
}
