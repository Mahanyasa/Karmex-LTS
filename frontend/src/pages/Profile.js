import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../api";

const platforms = {
  youtube: { label: "YouTube", base: "https://youtube.com/" },
  instagram: { label: "Instagram", base: "https://instagram.com/" },
  facebook: { label: "Facebook", base: "https://facebook.com/" },
  linkedin: { label: "LinkedIn", base: "https://linkedin.com/in/" },
  x: { label: "X", base: "https://x.com/" },
};

function socialUrl(value, base) {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return `${base}${value.replace(/^@/, "")}`;
}

export default function Profile() {
  const { username } = useParams();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get(`/social/profile/${username}`).then(({ data }) => setProfile(data)).catch((err) => setError(err.response?.data?.message || "Profile not found"));
  }, [username]);

  if (error) return <main className="public-profile-page"><div className="profile-error"><h1>{error}</h1><Link to="/">Back to Karmex LTS</Link></div></main>;
  if (!profile) return <main className="public-profile-page"><div className="profile-error">Loading profile...</div></main>;
  const links = Object.entries(platforms).filter(([key]) => profile.profile?.[key]);

  return (
    <main className="public-profile-page">
      <nav className="profile-nav"><Link className="brand" to="/"><span className="brand-mark">KL</span><span>Karmex LTS</span></Link><Link to="/">Back to workspace</Link></nav>
      <section className="profile-hero">
        <div className="profile-portrait">{profile.avatar ? <img src={profile.avatar} alt={`${profile.name} profile`} /> : profile.name.charAt(0).toUpperCase()}</div>
        <span className="eyebrow">KARMEX PROFILE</span>
        <h1>{profile.name}</h1><strong>@{profile.username}</strong>
        <p>{profile.profile?.bio || "This person has not added a bio yet."}</p>
        <div className="profile-social-links">
          {profile.profile?.website && <a href={profile.profile.website} target="_blank" rel="noreferrer"><span>WEB</span><div><small>Website</small><strong>{new URL(profile.profile.website).hostname}</strong></div><b>↗</b></a>}
          {links.map(([key, platform]) => <a key={key} href={socialUrl(profile.profile[key], platform.base)} target="_blank" rel="noreferrer"><span>{platform.label.slice(0, 2).toUpperCase()}</span><div><small>{platform.label}</small><strong>{profile.profile[key]}</strong></div><b>↗</b></a>)}
        </div>
        <small className="profile-member-since">Member since {new Date(profile.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</small>
      </section>
    </main>
  );
}
