Store Order and OrderLine records together. The Order invariant is that total equals the sum of lines. The use case currently writes both tables separately, which is problem 1.
