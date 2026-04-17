export default function PayCancel() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-4">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-semibold mb-2">Payment cancelled</h1>
        <p className="text-zinc-500">No charge was made. Contact your landlord if you have questions.</p>
      </div>
    </div>
  );
}
