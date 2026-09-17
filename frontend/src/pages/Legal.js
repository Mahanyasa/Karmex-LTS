import React from "react";
import { Link } from "react-router-dom";
import { LEGAL_EFFECTIVE_DATE, PRIVACY_VERSION, TERMS_VERSION } from "../legalVersions";

function LegalLayout({ title, summary, version, children }) {
  return (
    <div className="legal-page">
      <nav className="legal-nav">
        <Link className="brand" to="/">
          <span className="brand-mark">MK</span>
          <span>MK Life</span>
        </Link>
        <Link className="legal-back" to="/">Back to MK Life</Link>
      </nav>
      <main className="legal-document">
        <header className="legal-header">
          <span className="eyebrow">KARMEX CORP PVT LTD.</span>
          <h1>{title}</h1>
          <p>{summary}</p>
          <div className="legal-meta"><span>Version {version}</span><span>Effective {LEGAL_EFFECTIVE_DATE}</span><span>MK Life service</span></div>
        </header>
        <div className="legal-body">{children}</div>
        <footer className="legal-footer">
          <span>© 2026 Karmex Corp Pvt Ltd. All rights reserved.</span>
          <div><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link></div>
        </footer>
      </main>
    </div>
  );
}

export function PrivacyPolicy() {
  return (
    <LegalLayout title="Privacy Policy" version={PRIVACY_VERSION} summary="How MK Life collects, uses, stores, and protects information when you use our planning, reminder, and private-file tools.">
      <section><h2>1. Who we are</h2><p>MK Life is operated by Karmex Corp Pvt Ltd. In this policy, “Karmex,” “we,” “us,” and “our” refer to Karmex Corp Pvt Ltd, and “Service” refers to MK Life and its related applications and APIs.</p></section>
      <section><h2>2. Information we collect</h2><p>We collect account information such as your name, email address, encrypted password, and optional profile image. We also process content you provide, including boards, post-its, reminder dates, dictated text, and files uploaded to your private storage.</p><p>When you connect Google Calendar or GitHub, we receive OAuth tokens and connection status from those providers. GitHub integration also processes profile, organization, repository, pull request, issue, and commit metadata that your GitHub account is permitted to access. We do not receive your Google or GitHub password. We may also process technical information such as IP address, browser type, device information, timestamps, error logs, and security events.</p></section>
      <section><h2>3. How we use information</h2><p>We use information to provide and secure the Service, authenticate accounts, synchronize settings, create requested Calendar reminders, organize private files, diagnose failures, prevent abuse, communicate service information, and comply with legal obligations.</p></section>
      <section><h2>4. Google user data</h2><p>Google Calendar access is optional and is used only to create, update, or remove reminder events requested through MK Life. Google OAuth tokens are stored for this purpose and are not sold or used for advertising. You may disconnect Google Calendar at any time from Settings.</p></section>
      <section><h2>4A. GitHub data</h2><p>GitHub access is optional and is used to display your accessible personal and organization repositories and related activity inside MK Life. MK Life uses this integration in read-only product workflows, stores the OAuth token needed to retrieve that information, and does not publish code or modify repositories through the dashboard. You may disconnect GitHub at any time from Settings.</p></section>
      <section><h2>5. Private file storage</h2><p>User files are stored in a private Amazon S3 bucket under an account-specific path. MK Life uses short-lived signed URLs for uploads and downloads. You retain ownership of your files. Do not upload unlawful content or information you are not authorized to store.</p></section>
      <section><h2>6. Sharing and processors</h2><p>We do not sell personal information. We may share information with infrastructure and service providers acting on our behalf, including cloud hosting, database, storage, authentication, and Google Calendar services. We may also disclose information when required by law, to protect users or the Service, or as part of a corporate restructuring subject to appropriate safeguards.</p></section>
      <section><h2>7. Storage and retention</h2><p>We retain account information and user content while your account is active and as reasonably necessary to provide the Service, resolve disputes, enforce agreements, meet legal obligations, and maintain security records. Deleted content may remain temporarily in backups before routine deletion.</p></section>
      <section><h2>8. Your choices and rights</h2><p>You may update your profile, disconnect integrations, delete files, post-its, and boards, or request access, correction, export, or deletion of personal information, subject to applicable law. Revoking an integration stops future access but does not automatically remove events previously created in a third-party service.</p></section>
      <section><h2>9. Security and incidents</h2><p>We use reasonable administrative and technical safeguards, including authenticated API access, private object storage, scoped permissions, password hashing, and time-limited signed links. No online system can guarantee absolute security, and unauthorized access, disclosure, alteration, loss, or destruction may occur despite reasonable safeguards.</p><p>Where required by applicable law, we will investigate qualifying security incidents and provide legally required notifications. You are responsible for protecting your credentials, devices, integrations, and copies of important content.</p></section>
      <section><h2>10. Children</h2><p>The Service is not directed to children under 18 and we do not knowingly collect their personal information. If you believe a child has provided information, contact Karmex Corp Pvt Ltd so we can review and remove it where appropriate.</p></section>
      <section><h2>11. International processing</h2><p>Service providers may process information in countries other than your own. Where required, we use appropriate measures for cross-border processing and handle personal information in accordance with applicable Indian law.</p></section>
      <section><h2>12. Policy versions</h2><p>Each published policy has a version number and effective date. We retain prior versions as reasonably necessary for compliance records. Material changes may require renewed consent or acknowledgement. Continued use after the effective date constitutes acceptance where permitted by law.</p></section>
      <section><h2>13. Changes and contact</h2><p>We may update this policy as the Service or applicable law changes. Material updates will be communicated through the Service or other reasonable means. Privacy questions and rights requests may be submitted through the official support contact published by Karmex Corp Pvt Ltd within MK Life.</p></section>
    </LegalLayout>
  );
}

export function TermsConditions() {
  return (
    <LegalLayout title="Terms & Conditions" version={TERMS_VERSION} summary="The rules governing access to and use of MK Life, provided by Karmex Corp Pvt Ltd.">
      <section><h2>1. Acceptance</h2><p>By creating an account or using MK Life, you agree to these Terms & Conditions and the Privacy Policy. If you do not agree, do not use the Service. You must be at least 18 years old and legally capable of entering this agreement.</p></section>
      <section><h2>2. Accounts</h2><p>You must provide accurate information, protect your credentials, and promptly notify Karmex Corp Pvt Ltd of suspected unauthorized access. You are responsible for activity performed through your account unless prohibited by applicable law.</p></section>
      <section><h2>3. Service features</h2><p>MK Life provides boards, post-its, voice capture, reminders, Google Calendar and GitHub integrations, profile settings, and private file storage. Features may change, be limited, or be discontinued as the Service evolves. Third-party integrations require separate accounts and remain subject to their providers’ terms.</p></section>
      <section><h2>4. Reminders</h2><p>Reminders are convenience features and may be delayed or fail because of device settings, network conditions, third-party services, expired permissions, or system outages. Do not rely on MK Life for emergency, medical, legal, financial, safety-critical, or other time-critical notifications.</p></section>
      <section><h2>5. Your content</h2><p>You retain ownership of content you upload or create. You grant Karmex Corp Pvt Ltd a limited, non-exclusive license to host, process, transmit, and display that content only as necessary to operate, secure, and improve the Service. You represent that you have the rights required to provide the content.</p></section>
      <section><h2>6. Acceptable use</h2><p>You must not use the Service to violate law; infringe rights; distribute malware; store abusive, deceptive, or unlawful material; access another user’s account or files; interfere with infrastructure; evade limits; scrape the Service; or probe security without written authorization.</p></section>
      <section><h2>7. Karmex property</h2><p>The Service, software, visual design, trademarks, documentation, and related materials are owned by Karmex Corp Pvt Ltd or its licensors. These Terms provide a limited, revocable, non-transferable right to use the Service and do not transfer intellectual-property ownership.</p></section>
      <section><h2>8. Suspension and termination</h2><p>You may stop using the Service at any time. We may suspend or terminate access where reasonably necessary to address security risk, unlawful conduct, material breach, non-payment for paid features, or harm to users or infrastructure. Where practicable, we will provide notice.</p></section>
      <section><h2>9. Availability and disclaimers</h2><p>The Service is provided on an “as is” and “as available” basis to the extent permitted by law. We do not warrant uninterrupted operation, permanent storage, error-free reminders, or compatibility with every device or third-party service. Keep independent backups of important information.</p></section>
      <section><h2>10. Data security and user responsibility</h2><p>You acknowledge that internet and cloud services carry inherent security risks. To the maximum extent permitted by law, Karmex Corp Pvt Ltd is not responsible for unauthorized access, disclosure, corruption, or loss caused by compromised user credentials, user configuration, third-party services, malicious actors, events beyond reasonable control, or failure to maintain independent backups.</p><p>Nothing in these Terms excludes obligations or liability that cannot lawfully be excluded, including liability arising from fraud, wilful misconduct, gross negligence, or breach of a mandatory statutory duty where applicable.</p></section>
      <section><h2>11. Limitation of liability</h2><p>To the maximum extent permitted by law, Karmex Corp Pvt Ltd and its personnel will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, loss of data, lost profits, or business interruption arising from the Service. Any liability that cannot be excluded remains limited as permitted by applicable law.</p></section>
      <section><h2>12. Indemnity</h2><p>To the extent permitted by law, you agree to indemnify Karmex Corp Pvt Ltd against third-party claims arising from your unlawful use of the Service, your content, or your material violation of these Terms.</p></section>
      <section><h2>13. Governing law</h2><p>These Terms are governed by the laws of India, without regard to conflict-of-law principles. Subject to mandatory law, disputes will be submitted to the competent courts in the jurisdiction of Karmex Corp Pvt Ltd’s registered office.</p></section>
      <section><h2>14. Versioning and changes</h2><p>These Terms are identified by version and effective date. Karmex Corp Pvt Ltd may publish a new version when legal requirements or Service features change. Material updates may require renewed acceptance. The version accepted during registration is recorded with the account.</p></section>
      <section><h2>15. General terms</h2><p>If a provision is unenforceable, the remaining provisions remain effective. Failure to enforce a provision is not a waiver. You may not transfer these Terms without our consent.</p></section>
      <section><h2>16. Contact</h2><p>Questions about these Terms may be submitted through the official support contact published by Karmex Corp Pvt Ltd within MK Life.</p></section>
    </LegalLayout>
  );
}
