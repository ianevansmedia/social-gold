"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  onSnapshot,
  doc,
  updateDoc,
  arrayUnion,
  arrayRemove
} from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";

export default function ProfilePage() {
  const params = useParams();
  const username = params.username as string;
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [profileUser, setProfileUser] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      try {
        const q = query(collection(db, "users"), where("username", "==", username.toLowerCase()));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
          setProfileUser(null);
        } else {
          const userData = querySnapshot.docs[0].data();
          setProfileUser(userData);
          
          const postsQuery = query(
            collection(db, "posts"), 
            where("uid", "==", userData.uid),
            orderBy("createdAt", "desc")
          );

          const unsubscribe = onSnapshot(postsQuery, (snapshot) => {
            const userPosts = snapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            }));
            setPosts(userPosts);
          });

          return () => unsubscribe();
        }
      } catch (error) {
        console.error("Error fetching profile:", error);
      } finally {
        setLoading(false);
      }
    };

    if (username) fetchProfile();
  }, [username]);

  const handleLike = async (postId: string, postLikes: string[]) => {
    if (!user) return;
    const postRef = doc(db, "posts", postId);
    const hasLiked = postLikes.includes(user.uid);
    try {
      if (hasLiked) {
        await updateDoc(postRef, { likes: arrayRemove(user.uid) });
      } else {
        await updateDoc(postRef, { likes: arrayUnion(user.uid) });
      }
    } catch (error) {
      console.error("Error toggling like:", error);
    }
  };

  if (loading || authLoading) return <div className="min-h-screen bg-background" />;

  if (!profileUser) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground p-6">
        <h1 className="text-4xl font-black font-lexend text-primary mb-4 uppercase italic">Not Found</h1>
        <Link href="/feed" className="text-sm font-bold uppercase tracking-widest opacity-50 hover:opacity-100 transition-all">Return to Feed</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-jakarta pb-20">
      
      <nav className="sticky top-0 z-40 w-full border-b border-white/5 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-6">
          <Link href="/feed" className="text-3xl md:text-4xl font-black tracking-tighter font-lexend uppercase flex items-center gap-2">
            <span className="text-foreground">Social</span>
            <span className="text-primary">Gold</span>
          </Link>
          <Link href="/feed" className="text-sm font-bold uppercase tracking-widest text-primary border-2 border-primary/20 px-5 py-2.5 rounded-2xl bg-primary/5 shadow-md">
            Feed
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-2xl px-4 pt-10">
        
        <div className="mb-12 rounded-[2.5rem] bg-secondary p-10 shadow-2xl border border-white/5 text-center flex flex-col items-center">
          <div className="h-32 w-32 overflow-hidden rounded-full border-4 border-primary/50 shadow-2xl mb-6 ring-4 ring-primary/10">
            {profileUser.photoURL ? (
              <img src={profileUser.photoURL} alt={profileUser.username} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-background text-5xl opacity-20">👤</div>
            )}
          </div>
          
          <h2 className="text-4xl font-bold font-lexend text-primary mb-1 uppercase tracking-tight">{profileUser.displayName}</h2>
          <p className="text-[12px] font-bold opacity-30 uppercase tracking-[0.4em] mb-6">@{profileUser.username}</p>
          
          <p className="max-w-md text-xl opacity-80 leading-relaxed font-medium mb-8">
            {profileUser.bio || "This gold member hasn't added a bio yet."}
          </p>

          <div className="flex gap-12 border-t border-white/5 pt-8 w-full justify-center">
            <div className="flex flex-col">
              <span className="text-3xl font-black text-primary leading-none">{posts.length}</span>
              <span className="text-[10px] font-bold uppercase tracking-widest opacity-40 mt-1">Gold Posts</span>
            </div>
            <div className="flex flex-col">
              <span className="text-3xl font-black text-primary leading-none">
                {posts.reduce((acc, curr) => acc + (curr.likes?.length || 0), 0)}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest opacity-40 mt-1">Total Stars</span>
            </div>
          </div>
        </div>

        <h3 className="text-[10px] font-black uppercase tracking-[0.5em] opacity-20 mb-8 ml-6">Recent Activity</h3>
        
        <div className="space-y-10">
          {posts.map((post) => {
            const hasLiked = user && post.likes?.includes(user.uid);
            return (
              <div key={post.id} className="rounded-[2.5rem] bg-secondary p-10 shadow-xl border border-white/5 animate-in fade-in slide-in-from-bottom-8 duration-700">
                <p className="text-2xl leading-relaxed opacity-90 whitespace-pre-wrap font-medium">
                  {post.content}
                </p>
                
                <div className="mt-10 flex items-center gap-12 border-t border-white/5 pt-8">
                  <button onClick={() => handleLike(post.id, post.likes || [])} className={`flex items-center gap-4 text-sm font-black transition-all duration-300 ${hasLiked ? "text-primary scale-110" : "opacity-40 hover:opacity-100 hover:text-primary"}`}>
                    <span className="text-4xl">{hasLiked ? "✨" : "⭐"}</span>
                    <span>{post.likes?.length || 0}</span>
                  </button>

                  <button className="flex items-center gap-4 text-sm font-black opacity-40 hover:opacity-100 hover:text-primary transition-all">
                    <span className="text-4xl">💬</span>
                    <span>0</span>
                  </button>
                </div>
              </div>
            );
          })}

          {posts.length === 0 && (
            <div className="py-24 text-center">
              <p className="font-lexend text-2xl uppercase tracking-[0.5em] opacity-10">No gold shared yet</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}