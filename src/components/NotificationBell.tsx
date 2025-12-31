"use client";

import { useState, useEffect, useRef } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, orderBy, onSnapshot, limit, doc, writeBatch } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";

export default function NotificationBell() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "notifications"),
      where("toUid", "==", user.uid),
      orderBy("createdAt", "desc"),
      limit(20)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      // FIXED: Added 'as any' to map
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setNotifications(data);
      // FIXED: Explicitly typed 'n' as any
      setUnreadCount(data.filter((n: any) => !n.read).length);
    }, (error) => {
      if (error.code !== "permission-denied") console.error(error);
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const markAllRead = async () => {
    if (!user || unreadCount === 0) return;
    const batch = writeBatch(db);
    notifications.forEach(n => {
      if (!n.read) {
        batch.update(doc(db, "notifications", n.id), { read: true });
      }
    });
    await batch.commit();
  };

  const toggleOpen = () => {
    const nextState = !isOpen;
    setIsOpen(nextState);
    if (nextState) markAllRead();
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button onClick={toggleOpen} className="relative text-3xl p-1 hover:scale-110 transition-transform">
        🔔
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 h-5 w-5 bg-primary text-[10px] font-black flex items-center justify-center rounded-full text-primary-foreground border-2 border-background shadow-lg">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-4 w-80 max-h-[450px] overflow-y-auto bg-secondary border border-white/20 rounded-[2rem] shadow-2xl z-[100] animate-in zoom-in duration-200">
          <div className="p-6 border-b border-white/10">
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Notifications</h3>
          </div>
          <div className="divide-y divide-white/10">
            {notifications.length === 0 ? (
              <div className="p-10 text-center text-primary font-bold text-xs uppercase tracking-widest">No activity yet</div>
            ) : (
              notifications.map((n) => (
                <Link 
                  key={n.id} 
                  href={n.postId ? `/post/${n.postId}` : `/profile/${n.fromUsername}`}
                  onClick={() => setIsOpen(false)}
                  className={`block p-5 hover:bg-white/5 transition-all ${!n.read ? 'border-l-4 border-primary' : ''}`}
                >
                  <p className="text-sm font-semibold text-foreground">
                    <span className="font-bold text-primary">@{n.fromUsername}</span>
                    {n.type === "like" && " starred your gold post"}
                    {n.type === "comment" && " replied to your post"}
                    {n.type === "follow" && " started following you"}
                  </p>
                  <p className="text-[10px] text-foreground/50 mt-1 uppercase font-bold">
                    {n.createdAt?.toDate ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(n.createdAt.toDate()) : "Just now"}
                  </p>
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}