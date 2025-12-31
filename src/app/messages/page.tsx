"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, where, orderBy, onSnapshot, doc, getDoc } from "firebase/firestore";
import Link from "next/link";
import NotificationBell from "@/components/NotificationBell";

export default function MessagesInbox() {
  const { user, loading: authLoading } = useAuth();
  const [chats, setChats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "chats"),
      where("participants", "array-contains", user.uid),
      orderBy("lastUpdate", "desc")
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      try {
        const chatPromises = snapshot.docs.map(async (chatDoc) => {
          // FIXED: Added 'as any'
          const data = chatDoc.data() as any;
          const otherUid = data.participants?.find((id: string) => id !== user.uid);
          
          if (!otherUid) return null;

          const otherUserSnap = await getDoc(doc(db, "users", otherUid));
          const otherUser = otherUserSnap.exists() 
            ? otherUserSnap.data() 
            : { displayName: "Gold Member", username: "unknown", photoURL: "" };

          return {
            id: chatDoc.id,
            ...data,
            otherUser
          };
        });

        const results = await Promise.all(chatPromises);
        setChats(results.filter(c => c !== null));
        setLoading(false);
      } catch (err) {
        console.error("Inbox processing error:", err);
        setLoading(false);
      }
    }, (err) => {
      if (err.code !== "permission-denied") console.error("Inbox listener error:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  if (authLoading) return null;

  return (
    <div className="text-foreground font-jakarta">
      <nav className="sticky top-0 z-40 w-full border-b border-white/10 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4 md:py-6">
          <div className="flex items-center gap-3 md:gap-4">
            <Link href="/feed" className="text-primary text-2xl md:text-3xl p-1 md:p-2 hover:scale-110 transition-transform">←</Link>
            <h1 className="text-xl md:text-2xl font-black font-lexend uppercase tracking-tighter">Inbox</h1>
          </div>
          <NotificationBell />
        </div>
      </nav>

      <main className="mx-auto max-w-2xl px-4 py-6 md:py-8">
        {loading ? (
          <div className="py-20 text-center flex flex-col items-center justify-center text-primary animate-pulse">
            <span className="text-4xl mb-4">✉️</span>
            <p className="text-[10px] font-black uppercase tracking-[0.5em]">Syncing Vault...</p>
          </div>
        ) : (
          <>
            <h2 className="text-[10px] font-black uppercase tracking-[0.5em] text-primary mb-6 md:mb-8 px-2 md:px-4">Conversations</h2>
            
            <div className="space-y-3 md:space-y-4">
              {chats.length === 0 ? (
                <div className="text-center py-10 px-6 rounded-[2rem] md:rounded-[2.5rem] bg-secondary border border-white/10">
                  <p className="text-primary font-bold italic text-xs md:text-sm">Your vault is empty. Start a conversation from a member's profile.</p>
                </div>
              ) : (
                chats.map((chat) => (
                  <Link 
                    key={chat.id} 
                    href={`/messages/${chat.id}`}
                    className="flex items-center gap-4 md:gap-5 p-4 md:p-6 rounded-[1.5rem] md:rounded-[2.5rem] bg-secondary border border-white/10 hover:bg-white/5 transition-all group active:scale-[0.98] shadow-xl"
                  >
                    <div className="h-12 w-12 md:h-16 md:w-16 shrink-0 overflow-hidden rounded-full border-2 border-primary/20">
                       <img src={chat.otherUser.photoURL || "/default-avatar.png"} className="h-full w-full object-cover" alt="" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-1">
                        <p className="text-base md:text-lg font-bold text-primary font-lexend uppercase tracking-tight truncate pr-2">{chat.otherUser.displayName}</p>
                        <p className="text-[8px] md:text-[10px] font-bold text-foreground/40 whitespace-nowrap">
                          {chat.lastUpdate?.toDate ? new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: 'numeric' }).format(chat.lastUpdate.toDate()) : "New"}
                        </p>
                      </div>
                      <p className="text-xs md:text-sm text-foreground font-medium italic truncate">
                        {chat.lastMessage || "Click to open this vault..."}
                      </p>
                    </div>
                    <div className="text-primary opacity-100 transition-all text-xl md:text-2xl pr-1 md:pr-2 group-hover:translate-x-1">→</div>
                  </Link>
                ))
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}