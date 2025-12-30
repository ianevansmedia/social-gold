"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  serverTimestamp, 
  doc, 
  updateDoc,
  deleteDoc,
  arrayUnion,
  arrayRemove,
  where,
  limit,
  startAfter,
  getDocs,
  onSnapshot,
  DocumentData,
  QueryDocumentSnapshot
} from "firebase/firestore";
import Link from "next/link";
import { compressImage } from "@/lib/imageUtils";
import { createNotification } from "@/lib/notificationUtils";
import NotificationBell from "@/components/NotificationBell";
import PostSkeleton from "@/components/PostSkeleton";
import confetti from "canvas-confetti";

// Sub-component for smooth image loading
function PostImage({ src }: { src: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="relative mt-4 md:mt-6 rounded-2xl md:rounded-3xl overflow-hidden border border-white/5 shadow-2xl bg-white/5 min-h-[200px]">
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/5 to-transparent flex items-center justify-center">
            <span className="text-primary text-xs font-black uppercase tracking-widest opacity-20">Polishing Gold...</span>
        </div>
      )}
      <img 
        src={src} 
        alt="Post content" 
        loading="lazy" // Native browser lazy loading
        onLoad={() => setLoaded(true)}
        className={`w-full max-h-[400px] md:max-h-[500px] object-cover transition-opacity duration-1000 ease-in-out ${loaded ? 'opacity-100' : 'opacity-0'}`} 
      />
    </div>
  );
}

export default function FeedPage() {
  const { user, logout, loading: authLoading } = useAuth();
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
      if (entries[0].isIntersecting && hasMore) {
        fetchPosts(true);
      }
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
      const unsubscribe = onSnapshot(userRef, 
        (docSnap) => { if (docSnap.exists()) setUserData(docSnap.data()); },
        (error) => { if (error.code !== "permission-denied") console.error(error); }
      );
      return () => unsubscribe();
    }
  }, [user, authLoading, router]);

  const fetchPosts = async (isLoadMore = false) => {
    if (!isLoadMore) setIsLoadingInitial(true);
    else if (!hasMore || isLoadingMore) return;
    setIsLoadingMore(true);

    try {
      const baseQuery = collection(db, "posts");
      // UPDATED: Limit changed to 5 for faster Base64 processing
      const constraints: any[] = [orderBy("createdAt", "desc"), limit(5)];
      
      if (feedType === "following") {
        const followingList = userData?.following || [];
        if (followingList.length === 0) {
          setPosts([]); setHasMore(false); setIsLoadingInitial(false); setIsLoadingMore(false); return;
        }
        constraints.unshift(where("uid", "in", followingList));
      }
      if (isLoadMore && lastDoc) constraints.push(startAfter(lastDoc));
      
      const q = query(baseQuery, ...constraints);
      const snapshot = await getDocs(q);
      const newPosts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      if (isLoadMore) setPosts(prev => [...prev, ...newPosts]);
      else setPosts(newPosts);
      
      setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
      // UPDATED: Check for 5
      setHasMore(snapshot.docs.length === 5);
    } catch (error) { 
        console.error(error); 
    } finally { 
        setIsLoadingInitial(false);
        setIsLoadingMore(false); 
    }
  };

  useEffect(() => {
    if (userData || feedType === "global") {
        setLastDoc(null); setHasMore(true); fetchPosts(false);
    }
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
        likes: [], 
        commentCount: 0 
      });
      const freshPost = {
        id: docRef.id, content: newPost, postImage: postImage || null, uid: user?.uid,
        username: userData.username, displayName: userData.displayName,
        photoURL: userData.photoURL || "", createdAt: new Date(), likes: [], commentCount: 0
      };
      setPosts(prev => [freshPost, ...prev]);
      setNewPost(""); setPostImage(null);
    } catch (error) { showCustomAlert("Error", "Could not share gold."); }
    finally { setIsPosting(false); }
  };

  const handleLike = async (post: any) => {
    if (!user || !userData) return;
    const postRef = doc(db, "posts", post.id);
    const hasLiked = post.likes?.includes(user.uid);
    if (!hasLiked) {
      confetti({ particleCount: 40, spread: 70, origin: { y: 0.8 }, colors: ["#ca8a04", "#fde047", "#ffffff"] });
    }
    setPosts(prev => prev.map(p => {
        if (p.id === post.id) { return { ...p, likes: hasLiked ? p.likes.filter((id: string) => id !== user.uid) : [...(p.likes || []), user.uid] }; }
        return p;
    }));
    try {
      if (hasLiked) { await updateDoc(postRef, { likes: arrayRemove(user.uid) }); } 
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm animate-in fade-in duration-300 text-foreground">
          <div className="w-full max-w-sm rounded-[2.5rem] bg-secondary p-8 shadow-2xl border border-white/10 text-center animate-in zoom-in duration-300">
            <h2 className="text-2xl font-bold font-lexend text-primary mb-2 uppercase tracking-tight">{alert.title}</h2>
            <p className="text-sm opacity-60 mb-8 leading-relaxed font-medium">{alert.message}</p>
            <div className="flex flex-col gap-3">
              {alert.onConfirm ? (
                <><button onClick={() => { alert.onConfirm?.(); closeAlert(); }} style={{ background: "linear-gradient(to right, var(--gradient-from), var(--gradient-to))" }} className="w-full rounded-2xl py-4 font-black text-primary-foreground shadow-lg hover:brightness-110 active:scale-95 transition-all uppercase tracking-widest text-xs">Confirm</button><button onClick={closeAlert} className="w-full rounded-2xl py-4 font-bold opacity-40 hover:opacity-100 hover:bg-white/5 transition-all uppercase tracking-widest text-xs">Cancel</button></>
              ) : (
                <button onClick={closeAlert} style={{ background: "linear-gradient(to right, var(--gradient-from), var(--gradient-to))" }} className="w-full rounded-2xl py-4 font-black text-primary-foreground shadow-lg hover:brightness-110 active:scale-95 transition-all uppercase tracking-widest text-xs">Okay</button>
              )}
            </div>
          </div>
        </div>
      )}

      <nav className="sticky top-0 z-40 w-full border-b border-white/5 bg-background/60 backdrop-blur-xl">
        <div className="mx-auto flex items-center justify-between px-4 md:px-6 py-4 md:py-6 max-w-2xl">
          <Link href="/" className="text-2xl md:text-4xl font-black tracking-tighter font-lexend uppercase flex items-center gap-2"><span className="text-foreground">Social</span><span className="text-primary">Gold</span></Link>
          <div className="flex items-center gap-3 md:gap-6">
            <Link href="/search" className="text-2xl md:text-3xl hover:scale-110 transition-transform p-1">🔍</Link>
            <NotificationBell />
            {userData?.photoURL && (
              <Link href={`/profile/${userData.username}`} className="h-8 w-8 md:h-10 md:w-10 overflow-hidden rounded-full border-2 border-primary/50 shadow-lg hover:scale-105 transition-transform"><img src={userData.photoURL} alt="Me" className="h-full w-full object-cover" /></Link>
            )}
            <button onClick={() => logout()} className="text-[10px] md:text-base font-bold uppercase tracking-widest text-primary border-2 border-primary/20 px-3 py-2 md:px-5 md:py-2.5 rounded-xl md:rounded-2xl bg-primary/5 transition-all hover:scale-105 hover:brightness-110 active:scale-95">
              <span className="hidden md:inline">Logout</span>
              <span className="md:hidden">Bye</span>
            </button>
          </div>
        </div>
        <div className="mx-auto flex max-w-2xl px-4 md:px-6 border-t border-white/5">
           <button onClick={() => setFeedType("global")} className={`flex-1 py-4 md:py-5 text-xs md:text-base font-medium uppercase tracking-[0.2em] md:tracking-[0.3em] transition-all border-b-2 ${feedType === "global" ? "border-primary text-primary" : "border-transparent opacity-30"}`}>Global</button>
           <button onClick={() => setFeedType("following")} className={`flex-1 py-4 md:py-5 text-xs md:text-base font-medium uppercase tracking-[0.2em] md:tracking-[0.3em] transition-all border-b-2 ${feedType === "following" ? "border-primary text-primary" : "border-transparent opacity-30"}`}>Following</button>
        </div>
      </nav>

      <main className="mx-auto max-w-2xl px-4 pt-6 md:pt-10 relative z-10">
        <div className="mb-8 md:mb-12 rounded-[2rem] md:rounded-[2.5rem] bg-secondary/80 p-5 md:p-8 shadow-2xl border border-white/5 backdrop-blur-xl">
          <div className="flex gap-4 md:gap-5 mb-4">
            <div className="h-10 w-10 md:h-14 md:w-14 shrink-0 overflow-hidden rounded-full bg-background border border-primary/20 shadow-inner">
              {userData?.photoURL ? (<img src={userData.photoURL} alt="Avatar" className="h-full w-full object-cover" />) : (<div className="flex h-full w-full items-center justify-center opacity-20 text-xl">👤</div>)}
            </div>
            <form onSubmit={handleCreatePost} className="w-full">
              <textarea value={newPost} onChange={(e) => setNewPost(e.target.value)} placeholder="What is happening?" className="w-full resize-none border-none bg-transparent p-1 md:p-2 text-lg md:text-xl focus:outline-none focus:ring-0 placeholder:text-foreground/30 text-foreground font-medium" rows={3} />
              {postImage && (
                <div className="relative mt-4 mb-4 rounded-2xl md:rounded-3xl overflow-hidden border-2 border-primary/20 animate-in zoom-in duration-300">
                  <img src={postImage} alt="Preview" className="w-full max-h-60 md:max-h-80 object-cover" />
                  <button onClick={() => setPostImage(null)} className="absolute top-2 right-2 md:top-4 md:right-4 bg-black/50 text-white h-8 w-8 md:h-10 md:w-10 rounded-full backdrop-blur-md font-bold hover:bg-black transition-all">✕</button>
                </div>
              )}
            </form>
          </div>
          <div className="flex items-center justify-between border-t border-white/5 pt-5 md:pt-6 gap-3 md:gap-4">
            <label className="flex-1 cursor-pointer flex items-center justify-center gap-2 md:gap-3 py-3 md:py-4 rounded-xl md:rounded-2xl bg-white/5 hover:bg-white/10 transition-all active:scale-95 border border-white/5 shadow-md">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>
              </svg>
              <span className="text-[10px] md:text-sm font-black uppercase tracking-widest text-primary">Photo</span>
              <input type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
            </label>
            <button type="submit" onClick={handleCreatePost} disabled={isPosting} style={{ background: "linear-gradient(to right, var(--gradient-from), var(--gradient-to))" }} className={`flex-1 py-3 md:py-4 rounded-xl md:rounded-2xl text-[10px] md:text-sm font-black text-primary-foreground transition-all duration-300 transform active:scale-95 hover:scale-105 hover:brightness-110 shadow-[0_0_20px_rgba(202,138,4,0.4)] ${isPosting ? "opacity-30 cursor-not-allowed" : "opacity-100"}`}>
              {isPosting ? "POSTING..." : "SHARE GOLD"}
            </button>
          </div>
        </div>

        <div className="space-y-6 md:space-y-10">
          {isLoadingInitial ? (
            <><PostSkeleton /><PostSkeleton /><PostSkeleton /></>
          ) : (
            posts.map((post, index) => {
              const hasLiked = user && post.likes?.includes(user.uid);
              const isOwner = user && post.uid === user.uid;
              const isLastElement = posts.length === index + 1;

              return (
                <div key={post.id} ref={isLastElement ? lastPostElementRef : null} className="rounded-[2rem] md:rounded-[2.5rem] bg-secondary/80 p-5 md:p-8 shadow-xl border border-white/5 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-8 duration-700">
                  <div className="flex items-start gap-3 md:gap-5">
                    <Link href={`/profile/${post.username}`} className="h-10 w-10 md:h-14 md:w-14 shrink-0 overflow-hidden rounded-full border-2 border-primary/30 shadow-md hover:scale-105 transition-transform">{post.photoURL ? (<img src={post.photoURL} alt={post.username} className="h-full w-full object-cover" />) : (<div className="flex h-full w-full items-center justify-center bg-background text-sm">👤</div>)}</Link>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <Link href={`/profile/${post.username}`} className="flex items-center gap-2 md:gap-3 group truncate pb-1">
                          <span className="font-bold text-primary font-lexend text-lg md:text-2xl leading-tight group-hover:underline underline-offset-4 decoration-2 truncate">{post.displayName}</span>
                          <span className="text-[8px] md:text-[12px] font-bold opacity-60 uppercase tracking-[0.1em] md:tracking-[0.2em] truncate">@{post.username}</span>
                        </Link>
                        {isOwner && (<button onClick={() => handleDeletePost(post.id)} className="text-primary hover:text-red-500 transition-all p-1 md:p-2 text-lg md:text-xl hover:scale-125">🗑️</button>)}
                      </div>
                      <p className="mt-3 md:mt-5 text-base md:text-xl leading-relaxed opacity-100 whitespace-pre-wrap font-medium break-words">{post.content}</p>
                      
                      {/* LAZY LOADED IMAGE */}
                      {post.postImage && <PostImage src={post.postImage} />}
                      
                      <div className="mt-6 md:mt-8 flex items-center gap-4 md:gap-6 border-t border-white/5 pt-6 md:pt-8">
                        <button onClick={() => handleLike(post)} className="flex items-center gap-2 text-[10px] md:text-sm font-black transition-all hover:scale-110 active:scale-95 text-primary group">
                          <span className="text-2xl md:text-3xl group-hover:brightness-125">{hasLiked ? "✨" : "⭐"}</span>
                          <span className="opacity-100">{post.likes?.length || 0}</span>
                        </button>
                        <Link href={`/post/${post.id}`} className="flex items-center gap-2 text-[10px] md:text-sm font-black text-primary transition-all group hover:scale-110">
                          <span className="text-2xl md:text-3xl group-hover:brightness-125 transition-transform">💬</span>
                          <span className="opacity-100">{post.commentCount || 0} <span className="hidden md:inline">Comments</span></span>
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {isLoadingMore && <div className="mt-6 md:mt-10"><PostSkeleton /></div>}
      </main>
    </div>
  );
}