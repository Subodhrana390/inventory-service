import axios, { AxiosInstance } from "axios";

export const createInternalClient = (baseUrl: string, timeout = 5000): AxiosInstance => {
    const client = axios.create({
        baseURL: baseUrl,
        timeout,
    });
    return client;
};
