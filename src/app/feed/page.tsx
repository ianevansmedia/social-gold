"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { 
  collection, addDoc, query, orderBy, serverTimestamp, doc, updateDoc, deleteDoc, 
  arrayUnion, arrayRemove, where, limit, startAfter, getDocs, onSnapshot, 
  DocumentData, QueryDocumentSnapshot 
} from "firebase/firestore";
import Link from "next/link";
import { compressImage } from "@/lib/imageUtils";
import { createNotification } from "@/lib/notificationUtils";
import PostSkeleton from "@/components/PostSkeleton";
import Navbar from "@/components/Navbar";
import confetti from "canvas-confetti";

function PostImage({ src }: { src: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="relative mt-4 md:mt-6 rounded-2xl md:rounded-3xl overflow-hidden border border-white/5 shadow-2xl bg-white/5 min-h-[200px]">
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/5 to-transparent flex items-center justify-center">
            <span className="text-primary text-xs font-black uppercase tracking-widest">Polishing Gold...</span>
        </div>
      )}
      <img src={src} alt="" loading="lazy" onLoad={() => setLoaded(true)} className={`w-full max-h-[400px] md:max-h-[500px] object-cover transition-opacity duration-1000 ${loaded ? 'opacity-100' : 'opacity-0'}`} />
    </div>
  );
}

export default function FeedPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [userData, setUserData] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [newPost, setNewPost] = useState("");
  const [postImage, setPostImage] = useState<string | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const [feedType, setFeedType] = useState<"global" | "following">("global");

  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  
  const observer = useRef<IntersectionObserver | null>(null);
  const lastPostElementRef = useCallback((node: HTMLDivElement) => {
    if (isLoadingMore) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) fetchPosts(true);
    });
    if (node) observer.current.observe(node);
  }, [isLoadingMore, hasMore]);

  const [alert, setAlert] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: (() => void) | null; }>({ isOpen: false, title: "", message: "", onConfirm: null });
  const showCustomAlert = (title: string, message: string, onConfirm?: () => void) => setAlert({ isOpen: true, title, message, onConfirm: onConfirm || null });
  const closeAlert = () => setAlert({ ...alert, isOpen: false });

  useEffect(() => {
    if (!authLoading && !user) { router.push("/login"); return; }
    if (user) {
      const userRef = doc(db, "users", user.uid);
      const unsubscribe = onSnapshot(userRef, (docSnap) => {
        if (docSnap.exists()) setUserData(docSnap.data());
      }, (error) => { 
        if (error.code !== "permission-denied") console.error(error); 
      });
      return () => unsubscribe();
    }
  }, [user, authLoading, router]);

  const fetchPosts = async (isLoadMore = false) => {
    if (!isLoadMore) setIsLoadingInitial(true);
    else if (!hasMore || isLoadingMore) return;
    setIsLoadingMore(true);

    try {
      const baseQuery = collection(db, "posts");
      const constraints: any[] = [orderBy("createdAt", "desc"), limit(5)];
      if (feedType === "following") {
        const followingList = userData?.following || [];
        if (followingList.length === 0) { setPosts([]); setHasMore(false); setIsLoadingInitial(false); setIsLoadingMore(false); return; }
        constraints.unshift(where("uid", "in", followingList));
      }
      if (isLoadMore && lastDoc) constraints.push(startAfter(lastDoc));
      const q = query(baseQuery, ...constraints);
      const snapshot = await getDocs(q);
      // FIXED: Added 'as any'
      const newPosts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      if (isLoadMore) setPosts(prev => [...prev, ...newPosts]);
      else setPosts(newPosts);
      setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
      setHasMore(snapshot.docs.length === 5);
    } catch (error) { console.error(error); } finally { setIsLoadingInitial(false); setIsLoadingMore(false); }
  };

  useEffect(() => {
    if (userData || feedType === "global") { setLastDoc(null); setHasMore(true); fetchPosts(false); }
  }, [feedType, userData?.following]);

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImage(file, 1000, 0.7);
        setPostImage(compressed);
      } catch (error) { showCustomAlert("Error", "Could not process image."); }
    }
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newPost.trim() && !postImage) || !userData) return;
    setIsPosting(true);
    try {
      const docRef = await addDoc(collection(db, "posts"), {
        content: newPost, postImage: postImage || null, uid: user?.uid,
        username: userData.username, displayName: userData.displayName,
        photoURL: userData.photoURL || "", createdAt: serverTimestamp(), 
        likes: [], commentCount: 0 
      });
      setPosts(prev => [{ id: docRef.id, content: newPost, postImage, uid: user?.uid, username: userData.username, displayName: userData.displayName, photoURL: userData.photoURL, createdAt: new Date(), likes: [], commentCount: 0 }, ...prev]);
      setNewPost(""); setPostImage(null);
    } catch (error) { showCustomAlert("Error", "Could not share gold."); }
    finally { setIsPosting(false); }
  };

  const handleLike = async (post: any) => {
    if (!user || !userData) return;
    const postRef = doc(db, "posts", post.id);
    const hasLiked = post.likes?.includes(user.uid);
    if (!hasLiked) confetti({ particleCount: 40, spread: 70, origin: { y: 0.8 }, colors: ["#ca8a04", "#fde047", "#ffffff"] });
    setPosts(prev => prev.map(p => p.id === post.id ? { ...p, likes: hasLiked ? p.likes.filter((id: string) => id !== user.uid) : [...(p.likes || []), user.uid] } : p));
    try {
      if (hasLiked) await updateDoc(postRef, { likes: arrayRemove(user.uid) });
      else {
        await updateDoc(postRef, { likes: arrayUnion(user.uid) });
        await createNotification(post.uid, { uid: user.uid, username: userData.username, displayName: userData.displayName }, "like", post.id);
      }
    } catch (error) { console.error(error); }
  };

  const handleDeletePost = (postId: string) => {
    showCustomAlert("Confirm Delete", "Remove this post?", async () => {
      try { await deleteDoc(doc(db, "posts", postId)); setPosts(prev => prev.filter(p => p.id !== postId)); }
      catch (error) { showCustomAlert("Error", "Failed to delete."); }
    });
  };

  if (authLoading) return null;

  return (
    <div className="min-h-screen text-foreground font-jakarta pb-20">
      {alert.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-[2.5rem] bg-secondary p-8 shadow-2xl border border-white/10 text-center animate-in zoom-in duration-300">
            <h2 className="text-2xl font-bold font-lexend text-primary mb-2 uppercase">{alert.title}</h2>
            <p className="text-sm opacity-60 mb-8">{alert.message}</p>
            <div className="flex flex-col gap-3">
              {alert.onConfirm ? (
                <><button onClick={() => { alert.onConfirm?.(); closeAlert(); }} style={{ background: "linear-gradient(to right, var(--gradient-from), var(--gradient-to))" }} className="w-full rounded-2xl py-4 font-black text-primary-foreground shadow-lg hover:brightness-110 active:scale-95 transition-all uppercase tracking-widest text-xs">Confirm</button><button onClick={closeAlert} className="w-full rounded-2xl py-4 font-bold opacity-40 uppercase tracking-widest text-xs">Cancel</button></>
              ) : (
                <button onClick={closeAlert} style={{ background: "linear-gradient(to right, var(--gradient-from), var(--gradient-to))" }} className="w-full rounded-2xl py-4 font-black text-primary-foreground shadow-lg hover:brightness-110 active:scale-95 transition-all uppercase tracking-widest text-xs">Okay</button>
              )}
            </div>
          </div>
        </div>
      )}

      <Navbar />

      <div className="w-full border-b border-white/5 bg-background/40 backdrop-blur-xl sticky top-[73px] md:top-[89px] z-30">
          <div className="mx-auto flex max-w-2xl px-6">
            <button onClick={() => setFeedType("global")} className={`flex-1 py-4 md:py-5 text-xs md:text-base font-medium uppercase tracking-[0.2em] md:tracking-[0.3em] transition-all border-b-2 ${feedType === "global" ? "border-primary text-primary" : "border-transparent opacity-30"}`}>Global</button>
            <button onClick={() => setFeedType("following")} className={`flex-1 py-4 md:py-5 text-xs md:text-base font-medium uppercase tracking-[0.2em] md:tracking-[0.3em] transition-all border-b-2 ${feedType === "following" ? "border-primary text-primary" : "border-transparent opacity-30"}`}>Following</button>
          </div>
      </div>

      <main className="mx-auto max-w-2xl px-4 py-6 md:py-10 relative z-10">
        <div className="mb-8 md:mb-12 rounded-[2rem] md:rounded-[2.5rem] bg-secondary/80 p-5 md:p-8 shadow-2xl border border-white/5 backdrop-blur-xl">
          <div className="flex gap-4 md:gap-5 mb-4">
            <div className="h-10 w-10 md:h-14 md:w-14 shrink-0 overflow-hidden rounded-full bg-background border border-primary/20">
              {userData?.photoURL ? (<img src={userData.photoURL} alt="" className="h-full w-full object-cover" />) : (<div className="flex h-full w-full items-center justify-center opacity-20 text-xl">👤</div>)}
            </div>
            <form onSubmit={handleCreatePost} className="w-full">
              <textarea value={newPost} onChange={(e) => setNewPost(e.target.value)} placeholder="What is happening?" className="w-full resize-none border-none bg-transparent p-1 md:p-2 text-lg md:text-xl focus:outline-none focus:ring-0 placeholder:text-foreground/30 text-foreground font-medium" rows={3} />
              {postImage && (
                <div className="relative mt-4 mb-4 rounded-2xl md:rounded-3xl overflow-hidden border-2 border-primary/20"><img src={postImage} alt="" className="w-full max-h-60 md:max-h-80 object-cover" /><button onClick={() => setPostImage(null)} className="absolute top-2 right-2 md:top-4 md:right-4 bg-black/50 text-white h-8 w-8 md:h-10 md:w-10 rounded-full font-bold hover:bg-black transition-all">✕</button></div>
              )}
            </form>
          </div>
          <div className="flex items-center justify-between border-t border-white/5 pt-5 md:pt-6 gap-3 md:gap-4">
            <label className="flex-1 cursor-pointer flex items-center justify-center gap-2 md:gap-3 py-3 md:py-4 rounded-xl md:rounded-2xl bg-white/5 hover:bg-white/10 transition-all border border-white/5 shadow-md">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
              <span className="text-[10px] md:text-sm font-black uppercase tracking-widest text-primary">Photo</span>
              <input type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
            </label>
            <button type="submit" onClick={handleCreatePost} disabled={isPosting} style={{ background: "linear-gradient(to right, var(--gradient-from), var(--gradient-to))" }} className={`flex-1 py-3 md:py-4 rounded-xl md:rounded-2xl text-[10px] md:text-sm font-black text-primary-foreground transition-all duration-300 transform hover:scale-105 hover:brightness-110 shadow-[0_0_20px_rgba(202,138,4,0.4)] ${isPosting ? "opacity-30" : "opacity-100"}`}>POST GOLD</button>
          </div>
        </div>

        <div className="space-y-6 md:space-y-10">
          {isLoadingInitial ? (
            <><PostSkeleton /><PostSkeleton /><PostSkeleton /></>
          ) : (
            <>
              {posts.map((post, index) => {
                const hasLiked = user && post.likes?.includes(user.uid);
                const isOwner = user && post.uid === user.uid;
                const isLastElement = posts.length === index + 1;
                return (
                  <div key={post.id} ref={isLastElement ? lastPostElementRef : null} className="rounded-[2rem] md:rounded-[2.5rem] bg-secondary/80 p-5 md:p-8 shadow-xl border border-white/5 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-8">
                    <div className="flex items-start gap-3 md:gap-5">
                      <Link href={`/profile/${post.username}`} className="h-10 w-10 md:h-14 md:w-14 shrink-0 overflow-hidden rounded-full border-2 border-primary/30 shadow-md"><img src={post.photoURL} alt="" className="h-full w-full object-cover" /></Link>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <Link href={`/profile/${post.username}`} className="flex items-center gap-2 md:gap-3 group truncate pb-1">
                            <span className="font-bold text-primary font-lexend text-lg md:text-2xl leading-tight group-hover:underline truncate">{post.displayName}</span>
                            <span className="text-[8px] md:text-[12px] font-bold opacity-60 uppercase tracking-[0.1em] truncate">@{post.username}</span>
                          </Link>
                          {isOwner && (<button onClick={() => handleDeletePost(post.id)} className="text-primary hover:text-red-500 transition-all p-1 hover:scale-125">🗑️</button>)}
                        </div>
                        <p className="mt-3 md:mt-5 text-base md:text-xl leading-relaxed whitespace-pre-wrap font-medium break-words">{post.content}</p>
                        {post.postImage && <PostImage src={post.postImage} />}
                        <div className="mt-6 md:mt-8 flex items-center gap-4 md:gap-6 border-t border-white/5 pt-6 md:pt-8">
                          <button onClick={() => handleLike(post)} className="flex items-center gap-2 text-sm font-black transition-all hover:scale-110 active:scale-95 text-primary group"><span className="text-2xl md:text-3xl group-hover:brightness-125">{hasLiked ? "✨" : "⭐"}</span><span className="opacity-100">{post.likes?.length || 0}</span></button>
                          <Link href={`/post/${post.id}`} className="flex items-center gap-2 text-sm font-black text-primary transition-all group hover:scale-110"><span className="text-2xl md:text-3xl group-hover:brightness-125 transition-transform">💬</span><span className="opacity-100">{post.commentCount || 0} <span className="hidden md:inline">Comments</span></span></Link>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {posts.length === 0 && (
                <div className="py-20 text-center animate-in fade-in duration-1000">
                    <p className="text-primary font-bold italic">The vault is currently quiet.</p>
                </div>
              )}
            </>
          )}
        </div>
        {isLoadingMore && <div className="mt-6 md:mt-10"><PostSkeleton /></div>}
      </main>
    </div>
  );
}