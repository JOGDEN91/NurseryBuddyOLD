// app/parent/messages/page.tsx
export const dynamic = "force-dynamic";

export default function ParentMessagesPage() {
  return (
    <div className="space-y-3 text-sm text-gray-900">
      <h1 className="text-base font-semibold">Messages</h1>
      <p className="text-xs text-gray-500">
        This is where you&apos;ll see chats with your nursery and parent
        groups. We&apos;ll be wiring this up next.
      </p>
      <div className="rounded-lg border border-gray-200 bg-white p-4 text-xs text-gray-500">
        Messaging UI coming soon…
      </div>
    </div>
  );
}