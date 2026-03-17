export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm lg:flex">
        <h1 className="text-4xl font-bold">Verity</h1>
        <p className="mt-4 text-xl">
          Prediction Market on Flow EVM powered by Chainlink CRE
        </p>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
        {/* Market cards would go here */}
        <div className="rounded-xl border border-neutral-200 p-6 shadow-sm dark:border-neutral-800">
          <h2 className="text-xl font-semibold">Active Markets</h2>
          <p className="mt-2 text-neutral-600 dark:text-neutral-400">
            Browse and bet on current prediction markets.
          </p>
          <button className="mt-4 rounded-lg bg-black px-4 py-2 text-white dark:bg-white dark:text-black">
            View Markets
          </button>
        </div>

        <div className="rounded-xl border border-neutral-200 p-6 shadow-sm dark:border-neutral-800">
          <h2 className="text-xl font-semibold">My Bets</h2>
          <p className="mt-2 text-neutral-600 dark:text-neutral-400">
            Track your open positions and history.
          </p>
          <button className="mt-4 rounded-lg bg-black px-4 py-2 text-white dark:bg-white dark:text-black">
            My Dashboard
          </button>
        </div>

        <div className="rounded-xl border border-neutral-200 p-6 shadow-sm dark:border-neutral-800">
          <h2 className="text-xl font-semibold">Flow EVM Status</h2>
          <p className="mt-2 text-neutral-600 dark:text-neutral-400">
            Connected to Flow Testnet (Chain ID: 545)
          </p>
        </div>
      </div>
    </main>
  );
}
