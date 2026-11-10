/**
* Everything guests see lives in this file.
* Edit the values below and the whole site updates. No HTML required.
*/

export const couple = {
partnerOne: 'Blake',
partnerTwo: 'Casey',
hashtag: '#BlaseyWedding',
contactEmail: 'blaseywedding@gmail.com',
};

export const event = {
// Baroda is on Eastern Time; -04:00 is daylight time, which is in effect in September
dateISO: '2027-09-04T16:00:00-04:00',
dateLabel: 'September 4, 2027',
dayOfWeek: 'Saturday',
city: 'Baroda, Michigan',
venue: {
  name: 'Venue name',
  address: '2040 Russell Rd, Baroda, MI 49101',
  mapUrl: 'https://www.google.com/maps/search/?api=1&query=2040+Russell+Rd+Baroda+MI+49101',
},
inviteNote: 'Formal invitation to follow in early 2027.',
};

/**
* Engagement photos used as full-bleed section backgrounds. Use any filename
* from src/assets/photos, or '' for a solid color. Wide or landscape shots
* with some empty space (sky, grass, trees) work best behind text.
*/
export const sectionPhotos = {
hero: 'photo-01.jpg',
theDay: 'photo-04.jpg',
footer: 'photo-06.jpg',
};

export type StoryMoment = {
year: string;
title: string;
body: string;
/** Optional: a filename from src/assets/photos, e.g. 'photo-02.jpg' */
photo?: string;
};

export const story: StoryMoment[] = [
{
  year: '2019',
  title: 'We met at a friend’s terrible karaoke night',
  body: 'Casey sang one song badly on purpose. Blake sang three badly by accident. We closed the place down arguing about which was worse.',
  photo: 'photo-02.jpg',
},
{
  year: '2021',
  title: 'We adopted a dog with opinions',
  body: 'Biscuit chose us at the shelter, then chose the couch, then chose every other thing we owned.',
},
{
  year: '2025',
  title: 'The question',
  body: 'A sunrise hike, one very nervous proposal, and a ring that almost went over the edge. The answer was yes, eventually, between laughing fits.',
  photo: 'photo-05.jpg',
},
];

/** Alt text for gallery photos, keyed by filename. Anything missing gets a generic description. */
export const photoAlts: Record<string, string> = {
'photo-01.jpg': 'Blake and Casey laughing on a downtown street',
};

export type Hotel = {
name: string;
note: string;
bookingUrl: string;
/** Room-block code and deadline, if you have one */
blockCode?: string;
bookBy?: string;
};

export const travel = {
    airports: [
    { code: 'SBN', name: 'South Bend International', distance: 'About 40 minutes from the venue' },
    { code: 'MDW', name: 'Chicago Midway International', distance: 'About 1 hour 45 minutes away. Chicago is on Central Time, an hour behind Michigan.' },
    { code: 'GRR', name: 'Gerald R. Ford International (Grand Rapids)', distance: 'About 1 hour 45 minutes away' },
    { code: 'ORD', name: 'Chicago O’Hare International', distance: 'About 2 hours away. Chicago is on Central Time, an hour behind Michigan.' },
  ],
hotels: [
  {
    name: 'The Downtown Hotel',
    note: 'Closest to the venue, with a shuttle running both ways on the day.',
    bookingUrl: 'https://example.com',
    blockCode: 'BCWEDDING',
    bookBy: 'May 1, 2027',
  },
  {
    name: 'Riverside Inn',
    note: 'Quieter, walkable to coffee and the riverfront trail.',
    bookingUrl: 'https://example.com',
    blockCode: 'BC2027',
    bookBy: 'May 10, 2027',
  },
] satisfies Hotel[],
};

export const faqs = [
{
  q: 'When will we get the formal invitation?',
  a: 'Invitations with ceremony times and RSVP details go out in early 2027. For now, just save the date.',
},
{
  q: 'Are kids invited?',
  a: 'We love your kids, and we’re planning an adults-only celebration. We hope it’s a fun night off.',
},
{
  q: 'Can I bring a plus-one?',
  a: 'Your invitation will list everyone included. If it says “and guest,” bring whoever you like.',
},
{
  q: 'What should I wear?',
  a: 'Garden party cocktail. Think bright colors and comfortable shoes, because part of the evening is on grass.',
},
{
  q: 'Who do I ask if my question isn’t here?',
  a: `Email us at ${couple.contactEmail} and we’ll get back to you.`,
},
];
