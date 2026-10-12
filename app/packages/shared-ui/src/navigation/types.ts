export type RootStackParamList = {
  Profile: undefined;
  DrawerNavigator: undefined;
  Join: undefined;
  Lobby: undefined;
  Details: {
    mediaId?: string;
    title: string;
    description: string;
    headerImage: string;
    movie: string;
    category?: string;
    genres?: string[];
    releaseYear?: number;
    rating?: number;
    ratingCount?: number;
    contentRating?: string;
    duration?: number;
  };
  Player: {
    mediaId?: string;
    movie?: string;
    headerImage?: string;
  };
};

export type DrawerParamList = {
  Home: undefined;
  Explore: undefined;
  TV: undefined;
  Settings: undefined;
};
