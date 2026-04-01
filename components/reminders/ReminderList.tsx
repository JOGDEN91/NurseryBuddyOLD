- export default function ReminderList(props: { mode?: "all" | "self"; ...existing }) {
+ export default function ReminderList(props: {
+   mode?: "all" | "self";
+   readOnly?: boolean;
+   ...existing
+ }) {
+  const { readOnly } = props;

   // fetching logic unchanged (mode="self" should already filter to current user)

-  return (
-    <div>
-      <NewReminderButton ... />
-      <ReminderItems onDelete={...} onCreate={...} />
-    </div>
-  );
+  return (
+    <div>
+      {!readOnly && <NewReminderButton /* ... */ />}
+      <ReminderItems
+        /* ... */
+        onDelete={readOnly ? undefined : /* existing handler */}
+        onToggleComplete={readOnly ? undefined : /* existing handler */}
+      />
+    </div>
+  );
}